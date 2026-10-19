import {
  createAutoRecognitionTrigger,
  type AutoRecognitionInput,
} from '../autoRecognition';

const at = (nowMs: number, over: Partial<AutoRecognitionInput> = {}): AutoRecognitionInput => ({
  nowMs,
  silence: false,
  pastOutro: false,
  hasResult: false,
  recognizing: false,
  enabled: true,
  ...over,
});

test('fires on the first sound when nothing is recognized yet (launch into music)', () => {
  const t = createAutoRecognitionTrigger();
  expect(t.push(at(0, { silence: true }))).toBe(false);
  expect(t.push(at(20))).toBe(true);
});

test('does not fire again while recognizing or while the result stands', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0)); // fired
  expect(t.push(at(20, { recognizing: true }))).toBe(false);
  expect(t.push(at(40, { hasResult: true }))).toBe(false);
});

test('re-arms after 4 s of silence and fires when sound returns', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0));
  t.push(at(20, { hasResult: true }));
  for (let ms = 40; ms < 3_900; ms += 20) {
    expect(t.push(at(ms, { hasResult: true, silence: true }))).toBe(false);
  }
  expect(t.push(at(3_920, { hasResult: true }))).toBe(false);
  for (let ms = 4_000; ms <= 8_100; ms += 20) t.push(at(ms, { hasResult: true, silence: true }));
  expect(t.push(at(8_120, { hasResult: true }))).toBe(true);
});

test('fires once on the outro edge while sound continues', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0));
  t.push(at(20, { hasResult: true }));
  expect(t.push(at(40, { hasResult: true, pastOutro: true }))).toBe(true);
  expect(t.push(at(60, { hasResult: true, pastOutro: true }))).toBe(false);
});

test('never fires when disabled, and reset forgets the arming', () => {
  const t = createAutoRecognitionTrigger();
  expect(t.push(at(0, { enabled: false }))).toBe(false);
  expect(t.push(at(20, { enabled: false }))).toBe(false);

  const u = createAutoRecognitionTrigger();
  u.push(at(0));
  u.push(at(20, { hasResult: true }));
  u.reset();
  expect(u.push(at(40, { silence: true }))).toBe(false);
  expect(u.push(at(60))).toBe(true);
});

test('after a failed attempt (no result) it waits for the next silence-to-sound edge, not a timer', () => {
  const t = createAutoRecognitionTrigger();
  t.push(at(0));
  for (let ms = 20; ms < 25_000; ms += 20) {
    expect(t.push(at(ms, { recognizing: ms < 20_000 }))).toBe(false);
  }
  t.push(at(25_020, { silence: true }));
  expect(t.push(at(25_040))).toBe(true);
});
