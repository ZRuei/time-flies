const path = require('path');
const fs = require('fs');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-'));
process.env.DATA_DIR = tmpDir;

const store = require('../src/store');

afterEach(() => {
  const logPath = path.join(tmpDir, 'logs.json');
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
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

  test('getAllUserIds returns user ids', () => {
    store.setDmChannelId('U001', 'D001');
    store.setDmChannelId('U002', 'D002');
    const ids = store.getAllUserIds();
    expect(ids).toContain('U001');
    expect(ids).toContain('U002');
  });
});
