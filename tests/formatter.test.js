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
  const rickartIdx = result.indexOf('### Richart:');
  expect(result.indexOf('- 開會 1 小時')).toBeGreaterThan(rickartIdx);
  expect(result.indexOf('- 寫文件 1 小時')).toBeGreaterThan(rickartIdx);
});
