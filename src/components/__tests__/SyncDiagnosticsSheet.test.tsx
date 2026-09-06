import { render, userEvent } from '@testing-library/react-native';

import { SyncDiagnosticsContent } from '../SyncDiagnosticsSheet';
import type { SyncDiagnosticsController } from '../../recognition/syncDiagnostics/useSyncDiagnostics';
import type { SyncDiagnosticSample } from '../../recognition/syncDiagnostics/types';

const sample: SyncDiagnosticSample = {
  schemaVersion: 1, id: 'safe-trial',
  capture: { requestedDurationMs: 5_000, startedMonotonicMs: 10_000, endedMonotonicMs: 15_020 },
  audd: { timecodeRaw: '01:23', timecodeMs: 83_000, responseMonotonicMs: 15_800, title: 'Test Track', artist: 'Test Artist' },
  lrclib: { recordId: 42, syncedLineCount: 2, syncedLyricsHash: 'safe-hash' }, groundTruth: null,
};

function controller(): SyncDiagnosticsController {
  return {
    ready: true, storageError: null, samples: [], evaluations: [], approvedCalibration: null,
    decision: { kind: 'undecided' }, captureFlashVisible: false,
    notifyCaptureStarted: jest.fn(), saveTrial: jest.fn().mockResolvedValue(undefined),
    approveRecommendedCalibration: jest.fn().mockResolvedValue(undefined),
    rejectAudDAsClock: jest.fn().mockResolvedValue(undefined), clearDiagnostics: jest.fn().mockResolvedValue(undefined),
  };
}

it('runs only the selected diagnostic request and saves validated video evidence without rendering secrets', async () => {
  const diagnostics = controller();
  const onRunTrial = jest.fn();
  const user = userEvent.setup();
  const screen = await render(
    <SyncDiagnosticsContent diagnostics={diagnostics} onClose={jest.fn()} onRunTrial={onRunTrial} pendingTrial={{ sample, invalidReasons: ['missing_ground_truth'] }} />,
  );

  await user.press(screen.getByRole('button', { name: '5秒' }));
  await user.press(screen.getByRole('button', { name: '診断用に読み取る' }));
  expect(onRunTrial).toHaveBeenCalledWith(expect.objectContaining({ mode: 'diagnostic', clipDurationMs: 5_000, onCaptureStarted: diagnostics.notifyCaptureStarted }));

  await user.paste(screen.getByLabelText('再生位置'), '01:23.450');
  await user.paste(screen.getByLabelText('観測精度（ms）'), '80');
  await user.press(screen.getByRole('button', { name: 'この測定を保存' }));

  expect(diagnostics.saveTrial).toHaveBeenCalledWith(sample, {
    method: 'video-timed-controlled-playback', songPositionAtCaptureStartMs: 83_450, observedPrecisionMs: 80,
  });
  expect(screen.getByText('Test Artist — Test Track')).toBeTruthy();
  expect(screen.queryByText('full lyric line')).toBeNull();
  expect(screen.queryByText('owner-private-token')).toBeNull();
  expect(screen.queryByText('file:///cache/recognition.m4a')).toBeNull();
});
