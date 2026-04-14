# 工時紀錄 Slack Bot 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個 Slack Bot，讓使用者透過 `/start`、`/stop`、`/log`、`/summary` 指令紀錄工時，並自動將每日報告寫入 Slack Canvas「我愛工作」。

**Architecture:** Node.js + @slack/bolt（Socket Mode）。工時條目即時寫入 `/data/logs.json`（Railway Persistent Volume），計時器狀態存於記憶體。排程每日 09:00、14:00、19:00 自動寫入 Canvas；`/summary` 支援手動查詢區間。

**Tech Stack:** Node.js 20, @slack/bolt 3.x, node-cron 3.x, Jest 29.x, Railway (deploy + Persistent Volume)

---

## 檔案結構

```
work-hours-bot/
├── src/
│   ├── app.js              # 入口：建立 Bolt App，註冊所有 handler
│   ├── config.js           # 專案代碼與名稱對照表
│   ├── store.js            # logs.json 讀寫 + 記憶體計時器
│   ├── formatter.js        # 將條目格式化為 Canvas Markdown
│   ├── canvas.js           # Slack Canvas 建立 / append
│   └── commands/
│       ├── start.js        # /start 指令 + modal view handler
│       ├── stop.js         # /stop 指令
│       ├── log.js          # /log 指令 + modal + 按鈕 action
│       └── summary.js      # /summary 指令 + 日期解析（含 parseDateRange 匯出）
├── src/scheduler.js        # node-cron 排程
├── tests/
│   ├── store.test.js
│   ├── formatter.test.js
│   └── summary-parse.test.js
├── data/                   # Railway Volume 掛載點（.gitkeep）
├── .env.example
├── package.json
└── railway.toml
```

---

## Task 1: 專案骨架與依賴

**Files:**
- Create: `work-hours-bot/package.json`
- Create: `work-hours-bot/.env.example`
- Create: `work-hours-bot/railway.toml`
- Create: `work-hours-bot/data/.gitkeep`
- Create: `work-hours-bot/src/app.js`（骨架）

- [ ] **Step 1: 建立目錄結構**

```bash
mkdir -p work-hours-bot/src/commands work-hours-bot/tests work-hours-bot/data
cd work-hours-bot
```

- [ ] **Step 2: 初始化 package.json**

```bash
npm init -y
npm install @slack/bolt@^3.17.0 node-cron@^3.0.3 dotenv@^16.3.1
npm install --save-dev jest@^29.7.0
```

在 `package.json` 加入：
```json
{
  "scripts": {
    "start": "node src/app.js",
    "test": "jest"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: 建立 .env.example**

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
DATA_DIR=./data
```

- [ ] **Step 4: 建立 railway.toml**

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node src/app.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

> Note: Railway Persistent Volume 在 Railway Dashboard 設定，掛載至 `/data`，並設定環境變數 `DATA_DIR=/data`。

- [ ] **Step 5: 建立 src/app.js 骨架**

```javascript
require('dotenv').config();
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

(async () => {
  await app.start();
  console.log('⚡ Bot is running');
})();
```

- [ ] **Step 6: 建立 data/.gitkeep 並 commit**

```bash
touch data/.gitkeep
echo "data/logs.json" >> .gitignore
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
git init
git add .
git commit -m "feat: project scaffold"
```

---

## Task 2: config.js — 專案清單

**Files:**
- Create: `src/config.js`

- [ ] **Step 1: 建立 src/config.js**

```javascript
const PROJECTS = {
  RC: 'Richart',
  ASUS: 'ASUS',
  BOT: 'BOT',
};

module.exports = { PROJECTS };
```

- [ ] **Step 2: Commit**

```bash
git add src/config.js
git commit -m "feat: add project config"
```

---

## Task 3: store.js — 資料存取層

**Files:**
- Create: `src/store.js`
- Create: `tests/store.test.js`

- [ ] **Step 1: 寫失敗測試**

```javascript
// tests/store.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');

// 使用臨時目錄，避免污染真實資料
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-'));
process.env.DATA_DIR = tmpDir;

const store = require('../src/store');

afterEach(() => {
  // 清除 logs.json
  const logPath = path.join(tmpDir, 'logs.json');
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  // 清除記憶體計時器
  store.clearTimer('U001');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('timer', () => {
  test('startTimer / getTimer / clearTimer', () => {
    store.startTimer('U001', 'RC', '開會', 'D001');
    const t = store.getTimer('U001');
    expect(t.project).toBe('RC');
    expect(t.content).toBe('開會');
    expect(t.dmChannelId).toBe('D001');
    expect(typeof t.startTime).toBe('number');
    store.clearTimer('U001');
    expect(store.getTimer('U001')).toBeNull();
  });

  test('getTimer returns null when no timer', () => {
    expect(store.getTimer('U999')).toBeNull();
  });
});

describe('entries', () => {
  test('addEntry / getEntries', () => {
    store.addEntry('U001', '2026-04-14', { project: 'RC', content: '開會', hours: 1.5 });
    const result = store.getEntries('U001', '2026-04-14', '2026-04-14');
    expect(result['2026-04-14']).toHaveLength(1);
    expect(result['2026-04-14'][0].hours).toBe(1.5);
  });

  test('getEntries filters by date range', () => {
    store.addEntry('U001', '2026-04-13', { project: 'RC', content: 'A', hours: 1 });
    store.addEntry('U001', '2026-04-14', { project: 'RC', content: 'B', hours: 2 });
    store.addEntry('U001', '2026-04-15', { project: 'RC', content: 'C', hours: 3 });
    const result = store.getEntries('U001', '2026-04-13', '2026-04-14');
    expect(Object.keys(result)).toEqual(['2026-04-13', '2026-04-14']);
  });

  test('getEntries returns empty object when no data', () => {
    const result = store.getEntries('U999', '2026-04-14', '2026-04-14');
    expect(result).toEqual({});
  });
});

describe('metadata', () => {
  test('setCanvasId / getCanvasId', () => {
    store.setCanvasId('U001', 'F123');
    expect(store.getCanvasId('U001')).toBe('F123');
  });

  test('setDmChannelId / getDmChannelId', () => {
    store.setDmChannelId('U001', 'D123');
    expect(store.getDmChannelId('U001')).toBe('D123');
  });

  test('getAllUserIds returns only user ids (no internal keys)', () => {
    store.setDmChannelId('U001', 'D001');
    store.setDmChannelId('U002', 'D002');
    const ids = store.getAllUserIds();
    expect(ids).toContain('U001');
    expect(ids).toContain('U002');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx jest tests/store.test.js
```

Expected: FAIL（`Cannot find module '../src/store'`）

- [ ] **Step 3: 實作 src/store.js**

```javascript
const fs = require('fs');
const path = require('path');

const DATA_DIR = () => process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOGS_PATH = () => path.join(DATA_DIR(), 'logs.json');

// In-memory timer: userId -> { project, content, startTime, dmChannelId }
const timers = new Map();

function readLogs() {
  const p = LOGS_PATH();
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeLogs(data) {
  fs.mkdirSync(DATA_DIR(), { recursive: true });
  fs.writeFileSync(LOGS_PATH(), JSON.stringify(data, null, 2));
}

// --- Timer ---
function startTimer(userId, project, content, dmChannelId) {
  timers.set(userId, { project, content, startTime: Date.now(), dmChannelId });
}

function getTimer(userId) {
  return timers.get(userId) || null;
}

function clearTimer(userId) {
  timers.delete(userId);
}

// --- Entries ---
function addEntry(userId, date, entry) {
  const logs = readLogs();
  if (!logs[userId]) logs[userId] = { _meta: {}, entries: {} };
  if (!logs[userId].entries) logs[userId].entries = {};
  if (!logs[userId].entries[date]) logs[userId].entries[date] = [];
  logs[userId].entries[date].push(entry);
  writeLogs(logs);
}

function getEntries(userId, startDate, endDate) {
  const logs = readLogs();
  const userEntries = logs[userId]?.entries || {};
  const result = {};
  for (const [date, entries] of Object.entries(userEntries)) {
    if (date >= startDate && date <= endDate) {
      result[date] = entries;
    }
  }
  return result;
}

// --- Metadata ---
function setCanvasId(userId, canvasId) {
  const logs = readLogs();
  if (!logs[userId]) logs[userId] = { _meta: {}, entries: {} };
  if (!logs[userId]._meta) logs[userId]._meta = {};
  logs[userId]._meta.canvasId = canvasId;
  writeLogs(logs);
}

function getCanvasId(userId) {
  const logs = readLogs();
  return logs[userId]?._meta?.canvasId || null;
}

function setDmChannelId(userId, dmChannelId) {
  const logs = readLogs();
  if (!logs[userId]) logs[userId] = { _meta: {}, entries: {} };
  if (!logs[userId]._meta) logs[userId]._meta = {};
  logs[userId]._meta.dmChannelId = dmChannelId;
  writeLogs(logs);
}

function getDmChannelId(userId) {
  const logs = readLogs();
  return logs[userId]?._meta?.dmChannelId || null;
}

function getAllUserIds() {
  const logs = readLogs();
  return Object.keys(logs);
}

module.exports = {
  startTimer, getTimer, clearTimer,
  addEntry, getEntries,
  setCanvasId, getCanvasId,
  setDmChannelId, getDmChannelId,
  getAllUserIds,
};
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx jest tests/store.test.js
```

Expected: PASS（all tests green）

- [ ] **Step 5: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat: add store module with file persistence and timer"
```

---

## Task 4: formatter.js — Canvas Markdown 格式化

**Files:**
- Create: `src/formatter.js`
- Create: `tests/formatter.test.js`

- [ ] **Step 1: 寫失敗測試**

```javascript
// tests/formatter.test.js
const { formatEntries } = require('../src/formatter');

test('formats single day with one project', () => {
  const input = {
    '2026-04-14': [
      { project: 'RC', content: '開會討論需求', hours: 1.5 },
      { project: 'RC', content: '撰寫規格', hours: 2 },
    ],
  };
  const result = formatEntries(input);
  expect(result).toContain('## 2026-04-14');
  expect(result).toContain('### Richart:');
  expect(result).toContain('- 開會討論需求 1.5 小時');
  expect(result).toContain('- 撰寫規格 2 小時');
});

test('formats multiple days in date order', () => {
  const input = {
    '2026-04-15': [{ project: 'ASUS', content: 'UI 調整', hours: 1 }],
    '2026-04-13': [{ project: 'BOT', content: '串接 API', hours: 3 }],
  };
  const result = formatEntries(input);
  const idx13 = result.indexOf('## 2026-04-13');
  const idx15 = result.indexOf('## 2026-04-15');
  expect(idx13).toBeLessThan(idx15);
});

test('groups entries by project within same day', () => {
  const input = {
    '2026-04-14': [
      { project: 'RC', content: '開會', hours: 1 },
      { project: 'ASUS', content: 'UI', hours: 2 },
      { project: 'RC', content: '寫文件', hours: 1 },
    ],
  };
  const result = formatEntries(input);
  expect(result).toContain('### Richart:');
  expect(result).toContain('### ASUS:');
  // RC entries both appear under Richart section
  const rickartIdx = result.indexOf('### Richart:');
  const asuslIdx = result.indexOf('### ASUS:');
  expect(result.indexOf('- 開會 1 小時')).toBeGreaterThan(rickartIdx);
  expect(result.indexOf('- 寫文件 1 小時')).toBeGreaterThan(rickartIdx);
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx jest tests/formatter.test.js
```

Expected: FAIL

- [ ] **Step 3: 實作 src/formatter.js**

```javascript
const { PROJECTS } = require('./config');

function formatEntries(entriesByDate) {
  const sortedDates = Object.keys(entriesByDate).sort();

  return sortedDates.map(date => {
    const entries = entriesByDate[date];

    // Group by project, preserving insertion order
    const byProject = {};
    for (const entry of entries) {
      if (!byProject[entry.project]) byProject[entry.project] = [];
      byProject[entry.project].push(entry);
    }

    let block = `## ${date}\n`;
    for (const [projectCode, projectEntries] of Object.entries(byProject)) {
      const projectName = PROJECTS[projectCode] || projectCode;
      block += `### ${projectName}:\n`;
      for (const e of projectEntries) {
        block += `- ${e.content} ${e.hours} 小時\n`;
      }
      block += '\n';
    }
    return block;
  }).join('\n');
}

module.exports = { formatEntries };
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx jest tests/formatter.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/formatter.js tests/formatter.test.js
git commit -m "feat: add formatter for Canvas markdown output"
```

---

## Task 5: canvas.js — Canvas 建立與寫入

**Files:**
- Create: `src/canvas.js`

> 此模組直接呼叫 Slack Web API，需真實 token 才能整合測試，略過單元測試。

- [ ] **Step 1: 實作 src/canvas.js**

```javascript
const store = require('./store');

/**
 * 取得或建立使用者的「我愛工作」Canvas。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} userId
 * @param {string} dmChannelId
 * @returns {Promise<string>} canvasId
 */
async function getOrCreateCanvas(client, userId, dmChannelId) {
  const existingId = store.getCanvasId(userId);
  if (existingId) return existingId;

  const result = await client.conversations.canvases.create({
    channel_id: dmChannelId,
    document_content: {
      type: 'markdown',
      markdown: '# 我愛工作\n\n',
    },
  });

  const canvasId = result.canvas_id;
  store.setCanvasId(userId, canvasId);
  return canvasId;
}

/**
 * 在 Canvas 末端 append markdown 內容。
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} canvasId
 * @param {string} markdown
 */
async function appendToCanvas(client, canvasId, markdown) {
  await client.canvases.edit({
    canvas_id: canvasId,
    changes: [
      {
        operation: 'insert_at_end',
        document_content: {
          type: 'markdown',
          markdown,
        },
      },
    ],
  });
}

module.exports = { getOrCreateCanvas, appendToCanvas };
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas.js
git commit -m "feat: add canvas helper for create and append"
```

---

## Task 6: /start 指令

**Files:**
- Create: `src/commands/start.js`

- [ ] **Step 1: 實作 src/commands/start.js**

```javascript
const { PROJECTS } = require('../config');
const store = require('../store');

const PROJECT_OPTIONS = Object.entries(PROJECTS).map(([code, name]) => ({
  text: { type: 'plain_text', text: name },
  value: code,
}));

module.exports = function registerStart(app) {
  // 處理 /start 指令 — 開啟 modal
  app.command('/start', async ({ command, ack, client }) => {
    await ack();

    const userId = command.user_id;
    const existing = store.getTimer(userId);

    if (existing) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: `你有一筆尚未停止的計時（[${PROJECTS[existing.project]}] ${existing.content}），請先 /stop 後再開始新的。`,
      });
      return;
    }

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildStartModal(command.channel_id),
    });
  });

  // 處理 modal 送出
  app.view('start_modal', async ({ view, ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const project = view.state.values.project_block.project_select.selected_option.value;
    const content = view.state.values.content_block.content_input.value;

    // 開啟與使用者的 DM 頻道
    const dmResult = await client.conversations.open({ users: userId });
    const dmChannelId = dmResult.channel.id;
    store.setDmChannelId(userId, dmChannelId);

    store.startTimer(userId, project, content, dmChannelId);

    await client.chat.postMessage({
      channel: dmChannelId,
      text: `▶ 已開始計時：[${PROJECTS[project]}] ${content}`,
    });
  });
};

function buildStartModal(channelId) {
  return {
    type: 'modal',
    callback_id: 'start_modal',
    private_metadata: channelId,
    title: { type: 'plain_text', text: '開始計時' },
    submit: { type: 'plain_text', text: '開始' },
    close: { type: 'plain_text', text: '取消' },
    blocks: [
      {
        type: 'input',
        block_id: 'project_block',
        label: { type: 'plain_text', text: '專案' },
        element: {
          type: 'static_select',
          action_id: 'project_select',
          placeholder: { type: 'plain_text', text: '選擇專案' },
          options: PROJECT_OPTIONS,
        },
      },
      {
        type: 'input',
        block_id: 'content_block',
        label: { type: 'plain_text', text: '工作內容' },
        element: {
          type: 'plain_text_input',
          action_id: 'content_input',
          placeholder: { type: 'plain_text', text: '例如：開會討論需求' },
        },
      },
    ],
  };
}
```

- [ ] **Step 2: 在 app.js 註冊**

```javascript
// src/app.js
require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

registerStart(app);

(async () => {
  await app.start();
  console.log('⚡ Bot is running');
})();
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/start.js src/app.js
git commit -m "feat: add /start command with modal"
```

---

## Task 7: /stop 指令

**Files:**
- Create: `src/commands/stop.js`

- [ ] **Step 1: 實作 src/commands/stop.js**

```javascript
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
```

- [ ] **Step 2: 在 app.js 註冊**

```javascript
// src/app.js（新增 registerStop）
require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

registerStart(app);
registerStop(app);

(async () => {
  await app.start();
  console.log('⚡ Bot is running');
})();
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/stop.js src/app.js
git commit -m "feat: add /stop command"
```

---

## Task 8: /log 指令

**Files:**
- Create: `src/commands/log.js`

- [ ] **Step 1: 實作 src/commands/log.js**

```javascript
const { PROJECTS } = require('../config');
const store = require('../store');

const PROJECT_OPTIONS = Object.entries(PROJECTS).map(([code, name]) => ({
  text: { type: 'plain_text', text: name },
  value: code,
}));

module.exports = function registerLog(app) {
  app.command('/log', async ({ command, ack, client }) => {
    await ack();
    await openLogModal(client, command.trigger_id, command.channel_id);
  });

  app.view('log_modal', async ({ view, ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const project = view.state.values.project_block.project_select.selected_option.value;
    const content = view.state.values.content_block.content_input.value;
    const hours = parseFloat(view.state.values.hours_block.hours_input.value);
    const channelId = view.private_metadata;

    const dmResult = await client.conversations.open({ users: userId });
    const dmChannelId = dmResult.channel.id;
    store.setDmChannelId(userId, dmChannelId);

    const today = new Date().toISOString().slice(0, 10);
    store.addEntry(userId, today, { project, content, hours });

    await client.chat.postMessage({
      channel: dmChannelId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ 已記錄：[${PROJECTS[project]}] ${content} — ${hours} 小時`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: 'log_add_another',
              text: { type: 'plain_text', text: '再新增一筆' },
              value: channelId,
            },
            {
              type: 'button',
              action_id: 'log_done',
              text: { type: 'plain_text', text: '完成' },
            },
          ],
        },
      ],
    });
  });

  app.action('log_add_another', async ({ body, ack, client, action }) => {
    await ack();
    await openLogModal(client, body.trigger_id, action.value);
  });

  app.action('log_done', async ({ ack }) => {
    await ack();
  });
};

async function openLogModal(client, triggerId, channelId) {
  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'log_modal',
      private_metadata: channelId,
      title: { type: 'plain_text', text: '補記工時' },
      submit: { type: 'plain_text', text: '儲存' },
      close: { type: 'plain_text', text: '取消' },
      blocks: [
        {
          type: 'input',
          block_id: 'project_block',
          label: { type: 'plain_text', text: '專案' },
          element: {
            type: 'static_select',
            action_id: 'project_select',
            placeholder: { type: 'plain_text', text: '選擇專案' },
            options: PROJECT_OPTIONS,
          },
        },
        {
          type: 'input',
          block_id: 'content_block',
          label: { type: 'plain_text', text: '工作內容' },
          element: {
            type: 'plain_text_input',
            action_id: 'content_input',
            placeholder: { type: 'plain_text', text: '例如：撰寫文件' },
          },
        },
        {
          type: 'input',
          block_id: 'hours_block',
          label: { type: 'plain_text', text: '時數' },
          element: {
            type: 'plain_text_input',
            action_id: 'hours_input',
            placeholder: { type: 'plain_text', text: '例如：2.5' },
          },
        },
      ],
    },
  });
}
```

- [ ] **Step 2: 在 app.js 註冊**

```javascript
// src/app.js（完整，加入 registerLog）
require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');
const registerLog = require('./commands/log');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

registerStart(app);
registerStop(app);
registerLog(app);

(async () => {
  await app.start();
  console.log('⚡ Bot is running');
})();
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/log.js src/app.js
git commit -m "feat: add /log command with modal and add-another button"
```

---

## Task 9: /summary 指令與日期解析

**Files:**
- Create: `src/commands/summary.js`
- Create: `tests/summary-parse.test.js`

- [ ] **Step 1: 寫失敗測試**

```javascript
// tests/summary-parse.test.js
const { parseDateRange } = require('../src/commands/summary');

const TODAY = '2026-04-14'; // 週二

test('empty text returns today', () => {
  expect(parseDateRange('', TODAY)).toEqual({ start: TODAY, end: TODAY });
});

test('single date returns that date', () => {
  expect(parseDateRange('2026-04-10', TODAY)).toEqual({
    start: '2026-04-10',
    end: '2026-04-10',
  });
});

test('two dates returns range', () => {
  expect(parseDateRange('2026-04-01 2026-04-14', TODAY)).toEqual({
    start: '2026-04-01',
    end: '2026-04-14',
  });
});

test('this-week returns Monday to today', () => {
  // 2026-04-14 是週二，本週一是 2026-04-13
  expect(parseDateRange('this-week', TODAY)).toEqual({
    start: '2026-04-13',
    end: TODAY,
  });
});

test('last-week returns last Monday to last Sunday', () => {
  // 上週一 2026-04-06，上週日 2026-04-12
  expect(parseDateRange('last-week', TODAY)).toEqual({
    start: '2026-04-06',
    end: '2026-04-12',
  });
});

test('invalid format returns null', () => {
  expect(parseDateRange('blah', TODAY)).toBeNull();
  expect(parseDateRange('20260414', TODAY)).toBeNull();
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx jest tests/summary-parse.test.js
```

Expected: FAIL

- [ ] **Step 3: 實作 src/commands/summary.js**

```javascript
const store = require('../store');
const { formatEntries } = require('../formatter');
const { getOrCreateCanvas, appendToCanvas } = require('../canvas');

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
    const today = new Date().toISOString().slice(0, 10);
    const range = parseDateRange(command.text || '', today);

    if (!range) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '日期格式錯誤。範例：`/summary`、`/summary 2026-04-14`、`/summary 2026-04-01 2026-04-14`、`/summary this-week`、`/summary last-week`',
      });
      return;
    }

    const entries = store.getEntries(userId, range.start, range.end);

    if (Object.keys(entries).length === 0) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: '該區間沒有工時紀錄。',
      });
      return;
    }

    const dmResult = await client.conversations.open({ users: userId });
    const dmChannelId = dmResult.channel.id;
    store.setDmChannelId(userId, dmChannelId);

    const markdown = formatEntries(entries);
    const canvasId = await getOrCreateCanvas(client, userId, dmChannelId);
    await appendToCanvas(client, canvasId, markdown);

    const label =
      range.start === range.end ? range.start : `${range.start} ～ ${range.end}`;

    await client.chat.postMessage({
      channel: dmChannelId,
      text: `已將 ${label} 紀錄存入 Canvas ✓`,
    });
  });
};

module.exports.parseDateRange = parseDateRange;
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx jest tests/summary-parse.test.js
```

Expected: PASS

- [ ] **Step 5: 在 app.js 註冊並 commit**

```javascript
// src/app.js（完整最終版）
require('dotenv').config();
const { App } = require('@slack/bolt');
const registerStart = require('./commands/start');
const registerStop = require('./commands/stop');
const registerLog = require('./commands/log');
const registerSummary = require('./commands/summary');

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
  console.log('⚡ Bot is running');
})();
```

```bash
git add src/commands/summary.js tests/summary-parse.test.js src/app.js
git commit -m "feat: add /summary command with date range parsing"
```

---

## Task 10: 排程自動寫入

**Files:**
- Create: `src/scheduler.js`

- [ ] **Step 1: 實作 src/scheduler.js**

```javascript
const cron = require('node-cron');
const { WebClient } = require('@slack/web-api');
const store = require('./store');
const { formatEntries } = require('./formatter');
const { getOrCreateCanvas, appendToCanvas } = require('./canvas');

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
      await client.chat.postMessage({
        channel: dmChannelId,
        text: `已自動將今日（${today}）工時紀錄存入 Canvas ✓`,
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
```

- [ ] **Step 2: 在 app.js 啟動排程**

```javascript
// src/app.js（最終完整版，加入 setupScheduler）
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
```

- [ ] **Step 3: Commit**

```bash
git add src/scheduler.js src/app.js
git commit -m "feat: add scheduled auto-summary at 09:00/14:00/19:00"
```

---

## Task 11: 全測試通過

- [ ] **Step 1: 執行全部測試**

```bash
npx jest
```

Expected:
```
PASS tests/store.test.js
PASS tests/formatter.test.js
PASS tests/summary-parse.test.js

Test Suites: 3 passed, 3 total
Tests:       XX passed, XX total
```

若有失敗，修正後重新執行直到全過。

- [ ] **Step 2: Commit（若有修正）**

```bash
git add -p
git commit -m "fix: resolve test failures"
```

---

## Task 12: Railway 部署

- [ ] **Step 1: 在 Slack App 設定 Socket Mode**

1. 前往 https://api.slack.com/apps → 選擇你的 App
2. **Socket Mode** → Enable Socket Mode → 產生 App-Level Token（名稱任意，scope: `connections:write`）→ 複製 `xapp-...` token
3. **OAuth & Permissions** → Bot Token Scopes，加入：
   - `commands`
   - `chat:write`
   - `im:write`
   - `im:history`
   - `canvases:write`
   - `canvases:read`
   - `channels:join`
4. **Slash Commands** → 新增：`/start`、`/stop`、`/log`、`/summary`（Request URL 填任意 URL，Socket Mode 不使用）
5. **Install App to Workspace**，複製 `xoxb-...` Bot Token

- [ ] **Step 2: 推送至 GitHub**

```bash
git remote add origin https://github.com/<your-username>/work-hours-bot.git
git push -u origin main
```

- [ ] **Step 3: 在 Railway 建立專案**

1. 登入 https://railway.app → New Project → Deploy from GitHub Repo → 選擇 `work-hours-bot`
2. **Variables** → 新增：
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   SLACK_SIGNING_SECRET=...
   DATA_DIR=/data
   ```
3. **Volumes** → Add Volume → Mount Path: `/data`
4. 等待部署完成，確認 deploy log 顯示 `⚡ Bot is running`

- [ ] **Step 4: 驗收測試**

在 Slack 與 Bot DM 中依序執行：

1. `/start` → 選 RC → 填「測試工作」→ 送出 → 確認回覆 `▶ 已開始計時`
2. 等候約 1 分鐘
3. `/stop` → 確認回覆 `⏹ 已記錄：[Richart] 測試工作 — 0 小時`（不足 0.5 小時顯示 0）
4. `/log` → 選 ASUS → 填「UI 調整」→ 填 `2` → 送出 → 確認回覆 + 按鈕出現
5. 點「再新增一筆」→ 確認 modal 重開
6. `/summary` → 確認「我愛工作」Canvas 出現今日紀錄

---
