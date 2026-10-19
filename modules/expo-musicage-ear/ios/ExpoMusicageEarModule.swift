import AVFoundation
import ExpoModulesCore
import Foundation
import ShazamKit

/// Microphone "ear" for MUSICAGE.
///
/// Graph: inputNode -> analysisMixer (48 kHz mono) -> mainMixerNode (outputVolume 0) -> outputNode.
/// One tap on analysisMixer feeds ShazamKit while a match is requested and
/// the 20 ms feature analyzer all the time. The tap sits before the mute, so it
/// hears the mic while the speaker stays silent.
///
/// Threading: every piece of module state is read and written on `controlQueue`
/// (all functions run there via `runOnQueue`). The tap thread only touches the
/// analyzer it captured and `matchSink` (lock-protected). Feature events hop to
/// `eventQueue` before `sendEvent`.
public final class ExpoMusicageEarModule: Module {
  private let controlQueue = DispatchQueue(label: "musicage.ear.control")
  private let eventQueue = DispatchQueue(label: "musicage.ear.events")
  private let matchSink = MatchSink()

  private var engine: AVAudioEngine?
  private var analysisMixer: AVAudioMixerNode?
  private var analyzer: EarAnalyzer?
  private var interruptionObserver: NSObjectProtocol?

  /// Bumped by every stopListening, so a permission answer that arrives after
  /// a stop knows it was cancelled and does not start the engine.
  private var listenGeneration: UInt64 = 0

  private var matching = false
  private var session: SHSession?
  private var sessionDelegate: EarSessionDelegate?
  private var matchTimer: DispatchWorkItem?

  public func definition() -> ModuleDefinition {
    Name("ExpoMusicageEar")

    Events("onFeatures", "onRecognition", "onEarError")

    Function("now") {
      ProcessInfo.processInfo.systemUptime * 1_000
    }

    AsyncFunction("startListening") { (promise: Promise) in
      let generation = self.listenGeneration
      self.requestMicrophonePermission { granted in
        self.controlQueue.async {
          if generation != self.listenGeneration {
            // stopListening ran while the permission prompt was up.
          } else if granted {
            self.startEngine()
          } else {
            self.sendEvent("onEarError", ["code": "microphone_denied"])
          }
          promise.resolve()
        }
      }
    }.runOnQueue(controlQueue)

    AsyncFunction("stopListening") {
      self.stopListening()
    }.runOnQueue(controlQueue)

    AsyncFunction("listenForMatch") { (timeoutMs: Double) in
      self.listenForMatch(timeoutMs: timeoutMs)
    }.runOnQueue(controlQueue)

    AsyncFunction("cancelMatch") {
      self.cancelMatch()
    }.runOnQueue(controlQueue)

    OnDestroy {
      self.controlQueue.sync {
        self.stopListening()
      }
    }
  }

  // MARK: - Permission

  private func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { granted in
        completion(granted)
      }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        completion(granted)
      }
    }
  }

  // MARK: - Engine (controlQueue only)

  private func startEngine() {
    if let engine = engine {
      // Already set up. Restart only if an interruption left it stopped.
      if !engine.isRunning {
        do {
          try AVAudioSession.sharedInstance().setActive(true)
          try engine.start()
        } catch {
          stopListening()
          sendEvent("onEarError", ["code": "audio_setup_failed"])
        }
      }
      return
    }

    do {
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers])
      try audioSession.setActive(true)

      let engine = AVAudioEngine()
      let inputNode = engine.inputNode
      let inputFormat = inputNode.inputFormat(forBus: 0)
      guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
        throw EarSetupError.noInput
      }
      guard let monoFormat = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1) else {
        throw EarSetupError.badFormat
      }

      let analysisMixer = AVAudioMixerNode()
      engine.attach(analysisMixer)
      engine.connect(inputNode, to: analysisMixer, format: inputFormat)
      engine.connect(analysisMixer, to: engine.mainMixerNode, format: monoFormat)
      // Never play the mic back. The tap below is on analysisMixer, before this mute.
      engine.mainMixerNode.outputVolume = 0

      let analyzer = EarAnalyzer(sampleRate: 48_000)
      let sink = matchSink
      let eventQueue = self.eventQueue

      // Assign before installing the tap so a setup failure can clean up.
      self.engine = engine
      self.analysisMixer = analysisMixer
      self.analyzer = analyzer

      analysisMixer.installTap(onBus: 0, bufferSize: 1024, format: monoFormat) { [weak self] pcm, when in
        if let shazam = sink.current() {
          shazam.matchStreamingBuffer(pcm, at: when)
        }
        guard let channels = pcm.floatChannelData else { return }
        let frameCount = Int(pcm.frameLength)
        let hostTime = when.isHostTimeValid ? when.hostTime : mach_absolute_time()
        analyzer.push(channels[0], count: frameCount, bufferStartHostTime: hostTime) { frame in
          eventQueue.async {
            self?.sendEvent("onFeatures", [
              "t": frame.hostTimeSeconds * 1_000,
              "rms": Double(frame.rms),
              "low": Double(frame.low),
              "mid": Double(frame.mid),
              "high": Double(frame.high),
            ])
          }
        }
      }

      engine.prepare()
      try engine.start()
      observeInterruptions()
    } catch {
      stopListening()
      sendEvent("onEarError", ["code": "audio_setup_failed"])
    }
  }

  private func stopListening() {
    listenGeneration &+= 1
    cancelMatch()
    if let observer = interruptionObserver {
      NotificationCenter.default.removeObserver(observer)
      interruptionObserver = nil
    }
    guard let engine = engine else { return }
    analysisMixer?.removeTap(onBus: 0)
    engine.stop()
    self.engine = nil
    analysisMixer = nil
    analyzer = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  // MARK: - Interruptions

  private func observeInterruptions() {
    guard interruptionObserver == nil else { return }
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: nil
    ) { [weak self] notification in
      // Read plain values here so nothing non-Sendable crosses queues.
      guard let info = notification.userInfo,
        let typeRaw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
        let type = AVAudioSession.InterruptionType(rawValue: typeRaw)
      else { return }
      let optionsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let shouldResume = AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume)
      let began = type == .began
      self?.controlQueue.async {
        self?.handleInterruption(began: began, shouldResume: shouldResume)
      }
    }
  }

  private func handleInterruption(began: Bool, shouldResume: Bool) {
    guard let engine = engine else { return }
    if began {
      sendEvent("onEarError", ["code": "interrupted"])
      return
    }
    guard shouldResume, !engine.isRunning else { return }
    do {
      try AVAudioSession.sharedInstance().setActive(true)
      try engine.start()
    } catch {
      sendEvent("onEarError", ["code": "audio_setup_failed"])
    }
  }

  // MARK: - Matching (controlQueue only)

  private func listenForMatch(timeoutMs: Double) {
    guard !matching else { return }
    guard let engine = engine, engine.isRunning else {
      sendEvent("onEarError", ["code": "audio_setup_failed"])
      return
    }

    let shazam = SHSession()
    let delegate = EarSessionDelegate(module: self)
    shazam.delegate = delegate
    session = shazam
    sessionDelegate = delegate
    matching = true
    matchSink.set(shazam)

    let timer = DispatchWorkItem { [weak self] in
      guard let self = self, self.matching else { return }
      self.endMatch()
      self.sendEvent("onEarError", ["code": "match_timeout"])
    }
    matchTimer = timer
    let seconds = timeoutMs.isFinite ? max(0, timeoutMs) / 1_000 : 0
    controlQueue.asyncAfter(deadline: .now() + seconds, execute: timer)
  }

  private func cancelMatch() {
    endMatch()
  }

  private func endMatch() {
    matchTimer?.cancel()
    matchTimer = nil
    matching = false
    matchSink.set(nil)
    session?.delegate = nil
    session = nil
    sessionDelegate = nil
  }

  /// Called on ShazamKit's callback thread. Reads the match there, then hops.
  fileprivate func sessionDidFind(_ match: SHMatch, in shazam: SHSession) {
    let sessionId = ObjectIdentifier(shazam)
    let matchedAtNativeMs = ProcessInfo.processInfo.systemUptime * 1_000

    guard let item = match.mediaItems.first else {
      controlQueue.async { self.finishInvalidMatch(sessionId: sessionId) }
      return
    }
    guard let trackId = item.shazamID, !trackId.isEmpty else {
      controlQueue.async { self.finishInvalidMatch(sessionId: sessionId) }
      return
    }
    let predicted = item.predictedCurrentMatchOffset
    let offsetSeconds = predicted.isFinite ? predicted : item.matchOffset
    guard offsetSeconds.isFinite, offsetSeconds >= 0 else {
      controlQueue.async { self.finishInvalidMatch(sessionId: sessionId) }
      return
    }

    let title = item.title ?? ""
    let artist = item.artist ?? ""
    let artworkUrl = item.artworkURL?.absoluteString
    let currentOffsetMs = offsetSeconds * 1_000

    controlQueue.async {
      guard self.matching, let current = self.session, ObjectIdentifier(current) == sessionId else { return }
      self.endMatch()
      var artworkValue: Any = NSNull()
      if let artworkUrl = artworkUrl {
        artworkValue = artworkUrl
      }
      self.sendEvent("onRecognition", [
        "trackId": trackId,
        "title": title,
        "artist": artist,
        // SHMediaItem has no album property.
        "album": NSNull(),
        "artworkUrl": artworkValue,
        "matchedAtNativeMs": matchedAtNativeMs,
        "currentOffsetMs": currentOffsetMs,
      ])
    }
  }

  /// Called on ShazamKit's callback thread. `error == nil` is a transient miss: keep streaming.
  fileprivate func sessionDidNotFind(in shazam: SHSession, failed: Bool) {
    guard failed else { return }
    let sessionId = ObjectIdentifier(shazam)
    controlQueue.async {
      guard self.matching, let current = self.session, ObjectIdentifier(current) == sessionId else { return }
      self.endMatch()
      self.sendEvent("onEarError", ["code": "match_failed"])
    }
  }

  private func finishInvalidMatch(sessionId: ObjectIdentifier) {
    guard matching, let current = session, ObjectIdentifier(current) == sessionId else { return }
    endMatch()
    sendEvent("onEarError", ["code": "invalid_match"])
  }
}

private enum EarSetupError: Error {
  case noInput
  case badFormat
}

/// The SHSession the tap should stream into, or nil when not matching.
/// Read on the audio thread, written on the control queue.
private final class MatchSink {
  private let lock = NSLock()
  private var session: SHSession?

  func set(_ newSession: SHSession?) {
    lock.lock()
    session = newSession
    lock.unlock()
  }

  func current() -> SHSession? {
    lock.lock()
    defer { lock.unlock() }
    return session
  }
}

/// SHSessionDelegate has to be an NSObject; the module is not.
private final class EarSessionDelegate: NSObject, SHSessionDelegate {
  private weak var module: ExpoMusicageEarModule?

  init(module: ExpoMusicageEarModule) {
    self.module = module
  }

  func session(_ session: SHSession, didFind match: SHMatch) {
    module?.sessionDidFind(match, in: session)
  }

  func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
    module?.sessionDidNotFind(in: session, failed: error != nil)
  }
}
