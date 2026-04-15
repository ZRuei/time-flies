require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');
const registerLog = require('./commands/log');
const registerSummary = require('./commands/summary');
const { setupScheduler } = require('./scheduler');
const store = require('./store');

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

// 重置 Canvas ID（用於修復無效的 canvasId）
app.command('/resetcanvas', async ({ command, ack, client }) => {
  await ack();
  const userId = command.user_id;
  store.setCanvasId(userId, null);
  const dmResult = await client.conversations.open({ users: userId });
  await client.chat.postMessage({
    channel: dmResult.channel.id,
    text: 'Canvas ID 已清除，下次 `/summary` 會重新建立畫板。',
  });
});

(async () => {
  await app.start();
  setupScheduler();
  console.log('⚡ Bot is running');
})();
