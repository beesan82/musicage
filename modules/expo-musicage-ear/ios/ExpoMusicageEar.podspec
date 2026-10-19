Pod::Spec.new do |s|
  s.name           = 'ExpoMusicageEar'
  s.version        = '0.1.0'
  s.summary        = 'Microphone ear for MUSICAGE: ShazamKit matching and vDSP features'
  s.description    = 'One AVAudioEngine tap feeding ShazamKit matching and 20 ms RMS / band features for MUSICAGE.'
  s.author         = 'MUSICAGE'
  s.homepage       = 'https://example.invalid/musicage'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://example.invalid/musicage/expo-musicage-ear.git', :tag => s.version.to_s }
  s.source_files   = '*.swift'
  s.dependency     'ExpoModulesCore'
  s.frameworks     = 'ShazamKit', 'AVFoundation', 'Accelerate'
end
