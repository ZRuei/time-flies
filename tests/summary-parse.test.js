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
