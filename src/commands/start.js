const { PROJECTS } = require('../config');
const store = require('../store');

const PROJECT_OPTIONS = Object.entries(PROJECTS).map(([code, name]) => ({
  text: { type: 'plain_text', text: name },
  value: code,
}));

module.exports = function registerStart(app) {
  app.command('/start', async ({ command, ack, client }) => {
    await ack();

    const userId = command.user_id;
    const existing = store.getTimer(userId);

    if (existing) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: `你有一筆尚未停止的計時（[${PROJECTS[existing.project]}] ${existing.content}），請先 /stop 後再開始新的。`,
      });
      return;
    }

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildStartModal(command.channel_id),
    });
  });

  app.view('start_modal', async ({ view, ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const project = view.state.values.project_block.project_select.selected_option.value;
    const content = view.state.values.content_block.content_input.value;

    const dmResult = await client.conversations.open({ users: userId });
    const dmChannelId = dmResult.channel.id;
    store.setDmChannelId(userId, dmChannelId);

    store.startTimer(userId, project, content, dmChannelId);

    await client.chat.postMessage({
      channel: dmChannelId,
      text: `▶ 已開始計時：[${PROJECTS[project]}] ${content}`,
    });
  });
};

function buildStartModal(channelId) {
  return {
    type: 'modal',
    callback_id: 'start_modal',
    private_metadata: channelId,
    title: { type: 'plain_text', text: '開始計時' },
    submit: { type: 'plain_text', text: '開始' },
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
          placeholder: { type: 'plain_text', text: '例如：開會討論需求' },
        },
      },
    ],
  };
}
