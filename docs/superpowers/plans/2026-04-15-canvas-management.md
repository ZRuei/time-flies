# Canvas 管理實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `/summary` 完整重寫 canvas 內容、`/resetcanvas` 清空 canvas 與 store 資料，消除重複 canvas 問題。

**Architecture:** `store.js` 新增全量存取與刪除函數；`canvas.js` 用 `rewriteCanvas` 取代 `appendToCanvas`，先查詢現有 section 再 replace，找不到則 fallback 至 `insert_at_end`；`summary.js` 改傳全量資料；`/resetcanvas` 清空 canvas 內容並刪除 store 資料。

**Tech Stack:** Node.js, @slack/bolt v3, @slack/web-api v6（apiCall），Jest

---

### Task 1：store.js — 新增 `getAllEntries` 與 `deleteAllEntries`

**Files:**
- Modify: `src/store.js`
- Test: `tests/store.test.js`

- [ ] **Step 1：寫失敗測試**

在 `tests/store.test.js` 的 `describe('entries', ...)` 區塊內新增：

```js
test('getAllEntries returns all entries for user', () => {
  store.addEntry('U001', '2026-04-13', { project: 'RC', content: 'A', hours: 1 });
  store.addEntry('U001', '2026-04-15', { project: 'AS', content: 'B', hours: 2 });
  const result = store.getAllEntries('U001');
  expect(Object.keys(result)).toEqual(['2026-04-13', '2026-04-15']);
});

test('getAllEntries returns empty object when no data', () => {
  expect(store.getAllEntries('U999')).toEqual({});
});

test('deleteAllEntries removes all entries but keeps metadata', () => {
  store.addEntry('U001', '2026-04-14', { project: 'RC', content: 'X', hours: 1 });
  store.setCanvasId('U001', 'F123');
  store.deleteAllEntries('U001');
  expect(store.getAllEntries('U001')).toEqual({});
  expect(store.getCanvasId('U001')).toBe('F123'); // metadata 保留
});
```

- [ ] **Step 2：確認測試失敗**

```bash
npm test -- --testPathPattern=store
```

預期：FAIL — `store.getAllEntries is not a function`

- [ ] **Step 3：在 `src/store.js` 新增兩個函數**

在 `getEntries` 之後加入：

```js
function getAllEntries(userId) {
  const logs = readLogs();
  return logs[userId]?.entries || {};
}

function deleteAllEntries(userId) {
  const logs = readLogs();
  if (!logs[userId]) return;
  logs[userId].entries = {};
  writeLogs(logs);
}
```

並在 `module.exports` 加入這兩個函數：

```js
module.exports = {
  startTimer, getTimer, clearTimer,
  addEntry, getEntries, getAllEntries, deleteAllEntries,
  setCanvasId, getCanvasId,
  setDmChannelId, getDmChannelId,
  getAllUserIds,
};
```

- [ ] **Step 4：確認測試通過**

```bash
npm test -- --testPathPattern=store
```

預期：PASS（所有 store 測試）

- [ ] **Step 5：Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat: store 新增 getAllEntries 與 deleteAllEntries"
```

---

### Task 2：canvas.js — 以 `rewriteCanvas` 取代 `appendToCanvas`

**Files:**
- Modify: `src/canvas.js`

- [ ] **Step 1：將 `appendToCanvas` 替換為 `rewriteCanvas`**

將 `src/canvas.js` 中整個 `appendToCanvas` 函數及其 `console.log` 移除，並以下列程式碼取代。同時移除 `getOrCreateCanvas` 裡的 `console.log`：

```js
/**
 * 以最新資料完整重寫 Canvas 內容。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} canvasId
 * @param {string} markdown  空字串代表清空（只保留標題）
 */
async function rewriteCanvas(client, canvasId, markdown) {
  const fullContent = markdown
    ? `# 我愛工作\n\n${markdown}`
    : '# 我愛工作\n\n';

  // 先查詢現有 h1 section，找到則用 replace 覆蓋整份內容
  let sectionId = null;
  try {
    const lookup = await client.apiCall('canvases.sections.lookup', {
      canvas_id: canvasId,
      criteria: { contains_text: '我愛工作' },
    });
    sectionId = lookup.sections?.[0]?.id ?? null;
  } catch {}

  if (sectionId) {
    await client.apiCall('canvases.edit', {
      canvas_id: canvasId,
      changes: [{
        operation: 'replace',
        section_id: sectionId,
        document_content: { type: 'markdown', markdown: fullContent },
      }],
    });
  } else {
    // fallback：找不到 section 則 insert_at_end
    await client.apiCall('canvases.edit', {
      canvas_id: canvasId,
      changes: [{
        operation: 'insert_at_end',
        document_content: { type: 'markdown', markdown: fullContent },
      }],
    });
  }
}
```

同時更新 `module.exports`：

```js
module.exports = { getOrCreateCanvas, rewriteCanvas, getCanvasPermalink };
```

- [ ] **Step 2：Commit**

```bash
git add src/canvas.js
git commit -m "feat: canvas 改用 rewriteCanvas 完整覆寫內容"
```

---

### Task 3：summary.js — 改為全量重寫

**Files:**
- Modify: `src/commands/summary.js`

- [ ] **Step 1：更新 import 與資料撈取邏輯**

將 `src/commands/summary.js` 改為以下內容：

```js
const store = require('../store');
const { formatEntries } = require('../formatter');
const { getOrCreateCanvas, rewriteCanvas, getCanvasPermalink } = require('../canvas');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function parseDateRange(text, today) {
  const input = text.trim();

  if (input === '') return { start: today, end: today };

  if (input === 'this-week') {
    const d = new Date(today);
    const day = d.getDay();
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
    const today = new Date().toISOString().slice(0, 10);
    const range = parseDateRange(command.text || '', today);

    if (!range) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '日期格式錯誤。範例：`/summary`、`/summary 2026-04-14`、`/summary 2026-04-01 2026-04-14`、`/summary this-week`、`/summary last-week`',
      });
      return;
    }

    // 用全量資料重寫 canvas；確認至少有一筆資料
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
      const canvasId = await getOrCreateCanvas(client, userId, dmChannelId);
      await rewriteCanvas(client, canvasId, markdown);
      const permalink = await getCanvasPermalink(client, canvasId);
      const linkText = permalink ? `\n<${permalink}|開啟畫板>` : '';
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `已將 ${label} 紀錄同步至 Canvas ✓${linkText}`,
      });
    } catch (err) {
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `寫入 Canvas 失敗：${err.message}\n（請確認 Bot 已取得 \`canvases:write\` 權限）`,
      });
    }
  });
};

module.exports.parseDateRange = parseDateRange;
```

- [ ] **Step 2：確認既有測試仍通過**

```bash
npm test -- --testPathPattern=summary-parse
```

預期：PASS

- [ ] **Step 3：Commit**

```bash
git add src/commands/summary.js
git commit -m "feat: summary 改用全量重寫 canvas"
```

---

### Task 4：app.js — 更新 `/resetcanvas`

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1：更新 `/resetcanvas` handler**

將 `src/app.js` 中的 `/resetcanvas` handler 改為：

```js
const { rewriteCanvas } = require('./canvas');

// ... 其他 require 保持不動 ...

app.command('/resetcanvas', async ({ command, ack, client }) => {
  await ack();
  const userId = command.user_id;

  const dmResult = await client.conversations.open({ users: userId });
  const dmChannelId = dmResult.channel.id;

  const canvasId = store.getCanvasId(userId);

  if (canvasId) {
    try {
      await rewriteCanvas(client, canvasId, '');
    } catch {}
  }

  store.deleteAllEntries(userId);

  await client.chat.postMessage({
    channel: dmChannelId,
    text: 'Canvas 內容與工時記錄已全部清除。下次 `/log` 後執行 `/summary` 即可重新開始。',
  });
});
```

`src/app.js` 完整 require 區塊如下（確認 `rewriteCanvas` 有被引入）：

```js
require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');
const registerLog = require('./commands/log');
const registerSummary = require('./commands/summary');
const { setupScheduler } = require('./scheduler');
const store = require('./store');
const { rewriteCanvas } = require('./canvas');
```

- [ ] **Step 2：確認所有測試通過**

```bash
npm test
```

預期：所有測試 PASS

- [ ] **Step 3：Commit 並 push**

```bash
git add src/app.js
git commit -m "feat: resetcanvas 清空 canvas 內容與 store 資料"
git push
```

---

### Task 5：驗證（手動）

- [ ] **Step 1：確認 Railway 成功 deploy**

前往 Railway Dashboard → time-flies service → 確認最新 deployment 狀態為 Active。

- [ ] **Step 2：測試 `/summary`**

在 Slack 執行 `/summary`，確認：
- DM 訊息顯示「已將...同步至 Canvas ✓」並附連結
- 點開連結，canvas 顯示**所有**歷史工時（格式正確，不重複）
- 再執行一次 `/summary`，canvas 內容相同（冪等）

- [ ] **Step 3：測試 `/resetcanvas`**

執行 `/resetcanvas`，確認：
- DM 顯示清除成功訊息
- 打開 canvas，內容只剩標題「我愛工作」
- 再執行 `/summary`，顯示「尚無任何工時紀錄」

- [ ] **Step 4：重新 log 後驗證**

執行 `/log` 新增一筆，再執行 `/summary`，確認：
- Canvas 只有剛才這一筆（舊資料已清除）
- 格式正確
