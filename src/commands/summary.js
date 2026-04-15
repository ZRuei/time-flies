const store = require('../store');
const { formatEntries } = require('../formatter');
const { rewriteCanvas, getCanvasPermalink } = require('../canvas');
const { getTodayTaipei } = require('../date-helper');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function parseDateRange(text, today) {
  const input = text.trim();

  if (input === '') return { start: today, end: today };

  if (input === 'this-week') {
    const d = new Date(today);
    const day = d.getDay(); // 0=Sun
    const daysBack = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - daysBack);
    return { start: toISO(monday), end: today };
  }

  if (input === 'last-week') {
    const d = new Date(today);
    const day = d.getDay();
    const daysToLastMonday = day === 0 ? 13 : day + 6;
    const lastMonday = new Date(d);
    lastMonday.setDate(d.getDate() - daysToLastMonday);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return { start: toISO(lastMonday), end: toISO(lastSunday) };
  }

  const parts = input.split(/\s+/);
  if (parts.length === 1 && DATE_RE.test(parts[0])) {
    return { start: parts[0], end: parts[0] };
  }
  if (parts.length === 2 && DATE_RE.test(parts[0]) && DATE_RE.test(parts[1])) {
    return { start: parts[0], end: parts[1] };
  }

  return null;
}

module.exports = function registerSummary(app) {
  app.command('/summary', async ({ command, ack, client }) => {
    await ack();

    const userId = command.user_id;
    const today = getTodayTaipei();
    const range = parseDateRange(command.text || '', today);

    if (!range) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '日期格式錯誤。範例：`/summary`、`/summary 2026-04-14`、`/summary 2026-04-01 2026-04-14`、`/summary this-week`、`/summary last-week`',
      });
      return;
    }

    // 方案 A：canvas 永遠等於全量 store，參數僅用於訊息標籤
    const allEntries = store.getAllEntries(userId);

    if (Object.keys(allEntries).length === 0) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '尚無任何工時紀錄。',
      });
      return;
    }

    const dmResult = await client.conversations.open({ users: userId });
    const dmChannelId = dmResult.channel.id;
    store.setDmChannelId(userId, dmChannelId);

    const label =
      range.start === range.end ? range.start : `${range.start} ～ ${range.end}`;

    try {
      const markdown = formatEntries(allEntries);
      const newCanvasId = await rewriteCanvas(client, userId, dmChannelId, markdown);
      const permalink = await getCanvasPermalink(client, newCanvasId);
      const linkText = permalink ? `\n<${permalink}|開啟畫板>` : '';
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `Canvas 已同步所有工時紀錄 ✓（你查詢的區間：${label}）${linkText}`,
      });
    } catch (err) {
      console.error('[summary] rewriteCanvas failed:', err);
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `寫入 Canvas 失敗：${err.data?.error || err.message}`,
      });
    }
  });
};

module.exports.parseDateRange = parseDateRange;
