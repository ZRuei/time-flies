const { PROJECTS } = require('../config');
const store = require('../store');
const { getTodayTaipei } = require('../date-helper');

module.exports = function registerStop(app) {
  app.command('/stop', async ({ command, ack, client, respond }) => {
    await ack();

    const userId = command.user_id;
    const timer = store.getTimer(userId);

    if (!timer) {
      await respond({
        response_type: 'ephemeral',
        text: '目前沒有進行中的計時，請先使用 /start。',
      });
      return;
    }

    const elapsedMs = Date.now() - timer.startTime;
    // 四捨五入至 0.5 小時
    const hours = Math.round((elapsedMs / 3_600_000) * 2) / 2;

    const today = getTodayTaipei();
    store.addEntry(userId, today, {
      project: timer.project,
      content: timer.content,
      hours,
    });
    store.clearTimer(userId);

    const text = `⏹ 已記錄：[${PROJECTS[timer.project]}] ${timer.content} — ${hours} 小時`;

    // 在指令頻道給予即時回饋
    await respond({ response_type: 'ephemeral', text });

    // 同時在 Bot DM 留下紀錄（若不同頻道）
    if (timer.dmChannelId !== command.channel_id) {
      await client.chat.postMessage({ channel: timer.dmChannelId, text });
    }
  });
};
