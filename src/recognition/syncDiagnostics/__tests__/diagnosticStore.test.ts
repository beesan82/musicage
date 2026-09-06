import type { SyncDiagnosticSample } from '../types';
import {
  createDiagnosticStore,
  type DiagnosticStoreFile,
} from '../diagnosticStore';

function sample(id = 'trial-1'): SyncDiagnosticSample {
  return {
    schemaVersion: 1,
    id,
    capture: {
      requestedDurationMs: 5_000,
      startedMonotonicMs: 10_000,
      endedMonotonicMs: 15_000,
    },
    audd: {
      timecodeRaw: '01:23',
      timecodeMs: 83_000,
      responseMonotonicMs: 15_800,
      title: 'Test Track',
      artist: 'Test Artist',
    },
    lrclib: {
      recordId: 42,
      syncedLineCount: 2,
      syncedLyricsHash: 'sha256:abc',
    },
    groundTruth: null,
  };
}

function memoryFile(initialText: string | null = null): DiagnosticStoreFile & { value(): string | null } {
  let content = initialText;

  return {
    get exists() {
      return content !== null;
    },
    create() {
      if (content === null) {
        content = '';
      }
    },
    async text() {
      if (content === null) {
        throw new Error('file is absent');
      }

      return content;
    },
    write(next) {
      content = next;
    },
    delete() {
      content = null;
    },
    value() {
      return content;
    },
  };
}

describe('diagnosticStore', () => {
  it('loads an absent file as an empty snapshot and appends a safe sample', async () => {
    const file = memoryFile();
    const store = createDiagnosticStore(file);

    await expect(store.load()).resolves.toEqual({
      ok: true,
      snapshot: {
        schemaVersion: 1,
        samples: [],
        calibrations: [],
        decision: { kind: 'undecided' },
      },
    });

    await expect(store.appendSample(sample())).resolves.toMatchObject({
      ok: true,
      snapshot: {
        samples: [expect.objectContaining({ id: 'trial-1' })],
      },
    });
    expect(JSON.parse(file.value() ?? '{}')).toMatchObject({
      schemaVersion: 1,
      samples: [expect.objectContaining({ id: 'trial-1' })],
    });
  });

  it('preserves a corrupt local file when an append cannot safely read it', async () => {
    const file = memoryFile('{not json');
    const store = createDiagnosticStore(file);

    await expect(store.appendSample(sample())).resolves.toEqual({
      ok: false,
      error: 'read_failed',
    });
    expect(file.value()).toBe('{not json');
  });

  it('invalidates an existing calibration when a new safe trial is appended', async () => {
    const file = memoryFile(JSON.stringify({
      schemaVersion: 1,
      samples: [sample('previous-trial')],
      calibrations: [{
        schemaVersion: 1,
        clipDurationMs: 5_000,
        anchorOffsetMs: 4_000,
        acceptedSampleCount: 9,
      }],
      decision: { kind: 'approved', clipDurationMs: 5_000 },
    }));
    const store = createDiagnosticStore(file);

    await expect(store.appendSample(sample('new-trial'))).resolves.toMatchObject({
      ok: true,
      snapshot: {
        samples: [
          expect.objectContaining({ id: 'previous-trial' }),
          expect.objectContaining({ id: 'new-trial' }),
        ],
        calibrations: [],
        decision: { kind: 'undecided' },
      },
    });
  });

  it('clears local samples, calibrations, and decision without network access', async () => {
    const file = memoryFile(JSON.stringify({
      schemaVersion: 1,
      samples: [sample()],
      calibrations: [{
        schemaVersion: 1,
        clipDurationMs: 5_000,
        anchorOffsetMs: 4_000,
        acceptedSampleCount: 9,
      }],
      decision: { kind: 'approved', clipDurationMs: 5_000 },
    }));
    const store = createDiagnosticStore(file);
    const fetchSpy = jest.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      await expect(store.clear()).resolves.toEqual({
        ok: true,
        snapshot: {
          schemaVersion: 1,
          samples: [],
          calibrations: [],
          decision: { kind: 'undecided' },
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
