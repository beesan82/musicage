import { createClockConverter } from '../clockConverter';

test('offset is the median of native minus js samples', () => {
  const native = [1000, 1001, 1500, 1002, 1003][Symbol.iterator]();
  const js = [0, 0, 0, 0, 0][Symbol.iterator]();
  const c = createClockConverter(() => native.next().value as number, () => js.next().value as number);
  expect(c.offsetMs).toBe(1002);
  expect(c.toJsMs(2002)).toBe(1000);
});
test('toJsMs never goes backwards', () => {
  const c = createClockConverter(() => 100, () => 0, 1);
  expect(c.toJsMs(500)).toBe(400);
  expect(c.toJsMs(480)).toBe(400);
  expect(c.toJsMs(520)).toBe(420);
});
