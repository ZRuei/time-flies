const cron = require('node-cron');
const { WebClient } = require('@slack/web-api');
const store = require('./store');
const { formatEntries } = require('./formatter');
const { getOrCreateCanvas, appendToCanvas, getCanvasPermalink } = require('./canvas');
const { getTodayTaipei } = require('./date-helper');

async function runScheduledSummary() {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const today = getTodayTaipei();
  const userIds = store.getAllUserIds();

  for (const userId of userIds) {
    try {
      const dmChannelId = store.getDmChannelId(userId);
      if (!dmChannelId) continue;

      const unwritten = store.getUnwrittenEntries(userId, today);

      if (unwritten.length === 0) {
        const allEntries = store.getEntries(userId, today, today);
        if (Object.keys(allEntries).length === 0) {
          await client.chat.postMessage({
            channel: dmChannelId,
            text: '你今天還沒有工時紀錄，記得填寫！',
          });
        }
        // If there are entries but all are already written, skip silently
      } else {
        const entriesForCanvas = { [today]: unwritten };
        const markdown = formatEntries(entriesForCanvas);
        const canvasId = await getOrCreateCanvas(client, userId, dmChannelId);
        await appendToCanvas(client, canvasId, markdown);
        store.markEntriesWritten(userId, today);
        const permalink = await getCanvasPermalink(client, canvasId);
        const linkText = permalink ? `\n<${permalink}|開啟畫板>` : '';
        await client.chat.postMessage({
          channel: dmChannelId,
          text: `已自動將今日（${today}）工時紀錄存入 Canvas ✓${linkText}`,
        });
      }
    } catch (err) {
      console.error(`[scheduler] failed for user ${userId}:`, err);
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
