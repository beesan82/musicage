export interface ClockConverter {
  offsetMs: number;
  toJsMs(nativeMs: number): number;
}

export function createClockConverter(
  nativeNow: () => number,
  jsNow: () => number = () => performance.now(),
  samples = 5,
): ClockConverter {
  const offsets: number[] = [];
  for (let i = 0; i < samples; i++) offsets.push(nativeNow() - jsNow());
  offsets.sort((a, b) => a - b);
  const offsetMs = offsets[Math.floor(offsets.length / 2)] ?? 0;
  let last = -Infinity;
  return {
    offsetMs,
    toJsMs(nativeMs: number) {
      last = Math.max(last, nativeMs - offsetMs);
      return last;
    },
  };
}
