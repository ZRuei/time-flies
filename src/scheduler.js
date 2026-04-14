const cron = require('node-cron');
const { WebClient } = require('@slack/web-api');
const store = require('./store');
const { formatEntries } = require('./formatter');
const { getOrCreateCanvas, appendToCanvas, getCanvasPermalink } = require('./canvas');

async function runScheduledSummary() {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const today = new Date().toISOString().slice(0, 10);
  const userIds = store.getAllUserIds();

  for (const userId of userIds) {
    const dmChannelId = store.getDmChannelId(userId);
    if (!dmChannelId) continue;

    const entries = store.getEntries(userId, today, today);

    if (Object.keys(entries).length === 0) {
      await client.chat.postMessage({
        channel: dmChannelId,
        text: '你今天還沒有工時紀錄，記得填寫！',
      });
    } else {
      const markdown = formatEntries(entries);
      const canvasId = await getOrCreateCanvas(client, userId, dmChannelId);
      await appendToCanvas(client, canvasId, markdown);
      const permalink = await getCanvasPermalink(client, canvasId);
      const linkText = permalink ? `\n<${permalink}|開啟畫板>` : '';
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `已自動將今日（${today}）工時紀錄存入 Canvas ✓${linkText}`,
      });
    }
  }
}

function setupScheduler() {
  // 09:00、14:00、19:00 台灣時間（Asia/Taipei），週一至週五
  const times = ['0 9 * * 1-5', '0 14 * * 1-5', '0 19 * * 1-5'];
  for (const schedule of times) {
    cron.schedule(schedule, runScheduledSummary, { timezone: 'Asia/Taipei' });
  }
  console.log('⏰ Scheduler registered: 09:00, 14:00, 19:00 (Mon-Fri, Asia/Taipei)');
}

module.exports = { setupScheduler };
