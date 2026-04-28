require('dotenv').config();
const { App } = require('@slack/bolt');

// Socket Mode 偶爾會在 connecting 狀態收到 server explicit disconnect，
// 底層 finity 狀態機會 throw，未捕獲就會打死整個 process。
// 這裡攔下例外讓 Bolt 自己重連，避免整個 process 被打死。
process.on('uncaughtException', (err) => {
  if (err && /Unhandled event .* in state/.test(err.message || '')) {
    console.warn('[socket-mode] swallowed finity unhandled-event:', err.message);
    return;
  }
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');
const registerLog = require('./commands/log');
const registerSummary = require('./commands/summary');
const { setupScheduler } = require('./scheduler');
const store = require('./store');
const { deleteCanvas } = require('./canvas');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

registerStart(app);
registerStop(app);
registerLog(app);
registerSummary(app);

// 重置：刪除 canvas、清空 canvasId、刪除所有工時紀錄
app.command('/resetcanvas', async ({ command, ack, client }) => {
  await ack();
  const userId = command.user_id;

  try {
    await deleteCanvas(client, userId);
    store.deleteAllEntries(userId);

    const dmResult = await client.conversations.open({ users: userId });
    await client.chat.postMessage({
      channel: dmResult.channel.id,
      text: 'Canvas 與工時紀錄已全部清除。下次 `/log` 後執行 `/summary` 會重建畫板。',
    });
  } catch (err) {
    console.error('[resetcanvas] error:', err);
    try {
      const dmResult = await client.conversations.open({ users: userId });
      await client.chat.postMessage({
        channel: dmResult.channel.id,
        text: `重置過程發生錯誤：${err.data?.error || err.message}`,
      });
    } catch (_) { /* ignore secondary error */ }
  }
});

(async () => {
  await app.start();
  setupScheduler();
  console.log('⚡ Bot is running');
})();
