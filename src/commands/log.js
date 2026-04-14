const { PROJECTS } = require('../config');
const store = require('../store');

const PROJECT_OPTIONS = Object.entries(PROJECTS).map(([code, name]) => ({
  text: { type: 'plain_text', text: name },
  value: code,
}));

module.exports = function registerLog(app) {
  app.command('/log', async ({ command, ack, client }) => {
    await ack();
    await openLogModal(client, command.trigger_id, command.channel_id);
  });

  app.view('log_modal', async ({ view, ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const project = view.state.values.project_block.project_select.selected_option.value;
    const content = view.state.values.content_block.content_input.value;
    const hours = parseFloat(view.state.values.hours_block.hours_input.value);
    const channelId = view.private_metadata;

    const dmResult = await client.conversations.open({ users: userId });
    const dmChannelId = dmResult.channel.id;
    store.setDmChannelId(userId, dmChannelId);

    const today = new Date().toISOString().slice(0, 10);
    store.addEntry(userId, today, { project, content, hours });

    await client.chat.postMessage({
      channel: dmChannelId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ 已記錄：[${PROJECTS[project]}] ${content} — ${hours} 小時`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: 'log_add_another',
              text: { type: 'plain_text', text: '再新增一筆' },
              value: channelId,
            },
            {
              type: 'button',
              action_id: 'log_done',
              text: { type: 'plain_text', text: '完成' },
            },
          ],
        },
      ],
    });
  });

  app.action('log_add_another', async ({ body, ack, client, action }) => {
    await ack();
    await openLogModal(client, body.trigger_id, action.value);
  });

  app.action('log_done', async ({ ack }) => {
    await ack();
  });
};

async function openLogModal(client, triggerId, channelId) {
  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'log_modal',
      private_metadata: channelId,
      title: { type: 'plain_text', text: '補記工時' },
      submit: { type: 'plain_text', text: '儲存' },
      close: { type: 'plain_text', text: '取消' },
      blocks: [
        {
          type: 'input',
          block_id: 'project_block',
          label: { type: 'plain_text', text: '專案' },
          element: {
            type: 'static_select',
            action_id: 'project_select',
            placeholder: { type: 'plain_text', text: '選擇專案' },
            options: PROJECT_OPTIONS,
          },
        },
        {
          type: 'input',
          block_id: 'content_block',
          label: { type: 'plain_text', text: '工作內容' },
          element: {
            type: 'plain_text_input',
            action_id: 'content_input',
            placeholder: { type: 'plain_text', text: '例如：撰寫文件' },
          },
        },
        {
          type: 'input',
          block_id: 'hours_block',
          label: { type: 'plain_text', text: '時數' },
          element: {
            type: 'number_input',
            action_id: 'hours_input',
            is_decimal_allowed: true,
            placeholder: { type: 'plain_text', text: '例如：2.5' },
          },
        },
      ],
    },
  });
}
