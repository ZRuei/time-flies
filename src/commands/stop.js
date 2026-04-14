const { PROJECTS } = require('../config');
const store = require('../store');

module.exports = function registerStop(app) {
  app.command('/stop', async ({ command, ack, client }) => {
    await ack();

    const userId = command.user_id;
    const timer = store.getTimer(userId);

    if (!timer) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '目前沒有進行中的計時，請先使用 /start。',
      });
      return;
    }

    const elapsedMs = Date.now() - timer.startTime;
    // 四捨五入至 0.5 小時
    const hours = Math.round((elapsedMs / 3_600_000) * 2) / 2;

    const today = new Date().toISOString().slice(0, 10);
    store.addEntry(userId, today, {
      project: timer.project,
      content: timer.content,
      hours,
    });
    store.clearTimer(userId);

    await client.chat.postMessage({
      channel: timer.dmChannelId,
      text: `⏹ 已記錄：[${PROJECTS[timer.project]}] ${timer.content} — ${hours} 小時`,
    });
  });
};
