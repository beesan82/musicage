import { render, userEvent } from '@testing-library/react-native';

import { SyncDiagnosticsContent } from '../SyncDiagnosticsSheet';
import type { SyncDiagnosticsController } from '../../recognition/syncDiagnostics/useSyncDiagnostics';
import type { DurationEvaluation, SyncDiagnosticSample } from '../../recognition/syncDiagnostics/types';

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

function passedEvaluation(): DurationEvaluation {
  return {
    clipDurationMs: 5_000,
    status: 'passed',
    totalSampleCount: 9,
    validSampleCount: 9,
    uniqueTrackCount: 3,
    uniquePositionCount: 3,
    medianAnchorOffsetMs: 4_000,
    p90AbsoluteResidualMs: 100,
    maxAbsoluteResidualMs: 120,
    withinToleranceCount: 9,
    hardLimitViolationCount: 0,
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

it('retains an owner manual note but labels it as excluded from calibration acceptance', async () => {
  const diagnostics = controller();
  const user = userEvent.setup();
  const screen = await render(
    <SyncDiagnosticsContent diagnostics={diagnostics} onClose={jest.fn()} onRunTrial={jest.fn()} pendingTrial={{ sample, invalidReasons: [] }} />,
  );

  await user.press(screen.getByRole('button', { name: '手動メモ（合否外）' }));
  await user.paste(screen.getByLabelText('再生位置'), '00:30');
  await user.paste(screen.getByLabelText('観測精度（ms）'), '120');
  await user.press(screen.getByRole('button', { name: 'この測定を保存' }));

  expect(screen.getByText('手動メモは同期の合否判定には使いません。')).toBeTruthy();
  expect(diagnostics.saveTrial).toHaveBeenCalledWith(sample, {
    method: 'manual-estimate', songPositionAtCaptureStartMs: 30_000, observedPrecisionMs: 120,
  });
});

it('shows only safe calibration summaries and requires explicit approval or local clear confirmation', async () => {
  const diagnostics = controller();
  diagnostics.evaluations = [passedEvaluation()];
  const user = userEvent.setup();
  const screen = await render(
    <SyncDiagnosticsContent diagnostics={diagnostics} onClose={jest.fn()} onRunTrial={jest.fn()} pendingTrial={{ sample, invalidReasons: ['missing_timecode'] }} />,
  );

  expect(screen.getByText('5秒 — 合格')).toBeTruthy();
  expect(screen.getByText('有効 9/9・曲 3・位置 3')).toBeTruthy();
  expect(screen.getByText('検証外: AudD時刻がありません')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'この条件で同期を有効化' }));
  expect(diagnostics.approveRecommendedCalibration).toHaveBeenCalledTimes(1);

  await user.press(screen.getByRole('button', { name: '診断データを消去' }));
  expect(screen.getByText('このiPhone内の測定と校正だけを消去します。')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'このiPhoneの診断を消去' }));
  expect(diagnostics.clearDiagnostics).toHaveBeenCalledTimes(1);
});

it('offers explicit AudD clock rejection only after every tested duration has failed', async () => {
  const diagnostics = controller();
  diagnostics.evaluations = ([3_000, 5_000, 7_000, 12_000] as const).map((clipDurationMs) => ({
    ...passedEvaluation(), clipDurationMs, status: 'failed' as const,
  }));
  const user = userEvent.setup();
  const screen = await render(
    <SyncDiagnosticsContent diagnostics={diagnostics} onClose={jest.fn()} onRunTrial={jest.fn()} pendingTrial={null} />,
  );

  await user.press(screen.getByRole('button', { name: 'AudDを同期時計に使わない' }));

  expect(diagnostics.rejectAudDAsClock).toHaveBeenCalledTimes(1);
});
