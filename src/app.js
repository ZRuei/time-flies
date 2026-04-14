require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');
const registerLog = require('./commands/log');
const registerSummary = require('./commands/summary');
const { setupScheduler } = require('./scheduler');

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

(async () => {
  await app.start();
  setupScheduler();
  console.log('⚡ Bot is running');
})();
