const cron = require('node-cron');
const { WebClient } = require('@slack/web-api');
const store = require('./store');
const { getTodayTaipei } = require('./date-helper');

async function runScheduledReminder() {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  const today = getTodayTaipei();
  const userIds = store.getAllUserIds();

  for (const userId of userIds) {
    try {
      const dmChannelId = store.getDmChannelId(userId);
      if (!dmChannelId) continue;

      const todayEntries = store.getEntries(userId, today, today);
      const count = todayEntries[today]?.length ?? 0;

      const text = count === 0
        ? '你今天還沒有工時紀錄，記得 `/log` 或 `/start`！'
        : `你今天有 ${count} 筆工時紀錄。執行 \`/summary\` 可同步至 Canvas。`;

      await client.chat.postMessage({ channel: dmChannelId, text });
    } catch (err) {
      console.error(`[scheduler] failed for user ${userId}:`, err);
    }
  }
}

function setupScheduler() {
  // 09:00、14:00、19:00 台灣時間（Asia/Taipei），週一至週五
  const times = ['0 9 * * 1-5', '0 14 * * 1-5', '0 19 * * 1-5'];
  for (const schedule of times) {
    cron.schedule(schedule, runScheduledReminder, { timezone: 'Asia/Taipei' });
  }
  console.log('⏰ Scheduler registered: 09:00, 14:00, 19:00 (Mon-Fri, Asia/Taipei) — reminder only');
}

module.exports = { setupScheduler };
