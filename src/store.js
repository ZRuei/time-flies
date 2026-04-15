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

function startTimer(userId, project, content, dmChannelId) {
  timers.set(userId, { project, content, startTime: Date.now(), dmChannelId });
}

function getTimer(userId) {
  return timers.get(userId) || null;
}

function clearTimer(userId) {
  timers.delete(userId);
}

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
  addEntry, getEntries, getAllEntries, deleteAllEntries,
  setCanvasId, getCanvasId,
  setDmChannelId, getDmChannelId,
  getAllUserIds,
};
