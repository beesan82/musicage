import AVFoundation
import Accelerate
import Foundation

/// One 20 ms analysis frame. Levels are already mapped to 0...1.
struct EarFrame {
  let hostTimeSeconds: Double
  let rms: Float
  let low: Float
  let mid: Float
  let high: Float
}

/// Pure DSP: 48 kHz mono Float32 in, one `EarFrame` per 960-sample hop out.
/// Everything is allocated in `init`; `push` does no allocation and is meant
/// to run on the audio tap thread. Not thread-safe: call `push` from one thread.
///
/// `init` is failable: if vDSP cannot build the FFT setup the analyzer is nil
/// and the module reports `audio_setup_failed` instead of aborting the process.
final class EarAnalyzer {
  static let hop = 960
  static let windowSize = 1024
  private static let log2n: vDSP_Length = 10

  // Bin width is 48_000 / 1024 = 46.875 Hz.
  private static let lowBins = 1...4      // < 200 Hz
  private static let midBins = 5...42     // 200 Hz - 2 kHz
  private static let highBins = 43...511  // > 2 kHz

  // Same mapping as src/audio/meterFeatureProcessor.ts (dbToEnergy).
  private static let floorDb: Float = -72
  private static let ceilingDb: Float = -12

  private let sampleRate: Double
  private let fftSetup: FFTSetup

  /// Last `windowSize` samples; the newest hop is written at `history + (windowSize - hop)`.
  private let history: UnsafeMutablePointer<Float>
  private let window: UnsafeMutablePointer<Float>
  private let windowed: UnsafeMutablePointer<Float>
  private let real: UnsafeMutablePointer<Float>
  private let imag: UnsafeMutablePointer<Float>
  private let power: UnsafeMutablePointer<Float>

  /// Scales vDSP_zvmags output so the sum over all bins equals the
  /// time-domain mean square (RMS^2) of the frame (Parseval, window-compensated).
  private let powerScale: Float

  /// Samples of the current hop already written into `history`.
  private var filled = 0

  init?(sampleRate: Double = 48_000) {
    // Nothing is allocated before this point, so returning nil leaks nothing
    // (deinit does not run for an instance whose init failed here).
    guard let setup = vDSP_create_fftsetup(EarAnalyzer.log2n, FFTRadix(kFFTRadix2)) else {
      return nil
    }
    self.sampleRate = sampleRate
    fftSetup = setup

    let n = EarAnalyzer.windowSize
    let half = n / 2

    // Build everything in locals first: a class init may not touch `self`
    // until every stored property has a value.
    let hannWindow = EarAnalyzer.makeBuffer(n)
    vDSP_hann_window(hannWindow, vDSP_Length(n), Int32(vDSP_HANN_NORM))
    var windowEnergy: Float = 0
    vDSP_svesq(hannWindow, 1, &windowEnergy, vDSP_Length(n))

    history = EarAnalyzer.makeBuffer(n)
    window = hannWindow
    windowed = EarAnalyzer.makeBuffer(n)
    real = EarAnalyzer.makeBuffer(half)
    imag = EarAnalyzer.makeBuffer(half)
    power = EarAnalyzer.makeBuffer(half)

    // vDSP_fft_zrip returns 2 * DFT, so |Z_k|^2 = 4 |X_k|^2. For a one-sided
    // spectrum each bin 1..N/2-1 counts twice, and dividing by N * sum(w^2)
    // undoes the window's energy loss:
    //   meanSquare ~= sum_k 2 |X_k|^2 / (N * sum(w^2)) = sum_k |Z_k|^2 / (2 * N * sum(w^2))
    powerScale = windowEnergy > 0 ? 1 / (2 * Float(n) * windowEnergy) : 0
  }

  private static func makeBuffer(_ count: Int) -> UnsafeMutablePointer<Float> {
    let buffer = UnsafeMutablePointer<Float>.allocate(capacity: count)
    buffer.initialize(repeating: 0, count: count)
    return buffer
  }

  deinit {
    vDSP_destroy_fftsetup(fftSetup)
    let n = EarAnalyzer.windowSize
    let half = n / 2
    history.deinitialize(count: n)
    history.deallocate()
    window.deinitialize(count: n)
    window.deallocate()
    windowed.deinitialize(count: n)
    windowed.deallocate()
    real.deinitialize(count: half)
    real.deallocate()
    imag.deinitialize(count: half)
    imag.deallocate()
    power.deinitialize(count: half)
    power.deallocate()
  }

  /// Appends `count` samples that start at `bufferStartHostTime` and calls
  /// `onFrame` once for every completed 960-sample hop. A partial hop is kept
  /// for the next call.
  func push(
    _ samples: UnsafePointer<Float>,
    count: Int,
    bufferStartHostTime: UInt64,
    onFrame: (EarFrame) -> Void
  ) {
    guard count > 0 else { return }

    let hop = EarAnalyzer.hop
    let n = EarAnalyzer.windowSize
    let keep = n - hop
    let floatSize = MemoryLayout<Float>.stride
    let bufferStartSeconds = AVAudioTime.seconds(forHostTime: bufferStartHostTime)

    var offset = 0
    while offset < count {
      let take = min(hop - filled, count - offset)
      memcpy(history + keep + filled, samples + offset, take * floatSize)
      filled += take
      offset += take

      if filled == hop {
        // `offset` is the position just past the hop's last sample in this buffer.
        let hostTimeSeconds = bufferStartSeconds + Double(offset) / sampleRate
        onFrame(analyze(hostTimeSeconds: hostTimeSeconds))
        // Slide: the newest `keep` samples become the start of the next window.
        // Source [hop, n) and destination [0, keep) do not overlap because keep < hop.
        memcpy(history, history + hop, keep * floatSize)
        filled = 0
      }
    }
  }

  private func analyze(hostTimeSeconds: Double) -> EarFrame {
    let hop = EarAnalyzer.hop
    let n = EarAnalyzer.windowSize
    let half = n / 2

    // RMS of the newest hop (960 samples).
    var hopRms: Float = 0
    vDSP_rmsqv(history + (n - hop), 1, &hopRms, vDSP_Length(hop))

    // Hann-windowed real FFT of the newest 1024 samples.
    vDSP_vmul(history, 1, window, 1, windowed, 1, vDSP_Length(n))
    var split = DSPSplitComplex(realp: real, imagp: imag)
    windowed.withMemoryRebound(to: DSPComplex.self, capacity: half) { complexPointer in
      vDSP_ctoz(complexPointer, 2, &split, 1, vDSP_Length(half))
    }
    vDSP_fft_zrip(fftSetup, &split, 1, EarAnalyzer.log2n, FFTDirection(FFT_FORWARD))
    vDSP_zvmags(&split, 1, power, 1, vDSP_Length(half))

    return EarFrame(
      hostTimeSeconds: hostTimeSeconds,
      rms: EarAnalyzer.energy(fromRms: hopRms),
      low: EarAnalyzer.energy(fromRms: bandRms(EarAnalyzer.lowBins)),
      mid: EarAnalyzer.energy(fromRms: bandRms(EarAnalyzer.midBins)),
      high: EarAnalyzer.energy(fromRms: bandRms(EarAnalyzer.highBins))
    )
  }

  private func bandRms(_ bins: ClosedRange<Int>) -> Float {
    var sum: Float = 0
    vDSP_sve(power + bins.lowerBound, 1, &sum, vDSP_Length(bins.count))
    let meanSquare = sum * powerScale
    return meanSquare > 0 ? meanSquare.squareRoot() : 0
  }

  /// dBFS, then floor -72 / ceiling -12 linearised to 0...1, then square root.
  private static func energy(fromRms rms: Float) -> Float {
    guard rms > 0, rms.isFinite else { return 0 }
    let db = 20 * log10f(rms)
    guard db > floorDb else { return 0 }
    let normalized = min(1, max(0, (db - floorDb) / (ceilingDb - floorDb)))
    return normalized.squareRoot()
  }
}
