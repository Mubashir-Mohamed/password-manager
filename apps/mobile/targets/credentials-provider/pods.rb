# Picked up automatically by @bacons/apple-targets' Podfile loader (see
# ios/Podfile's "apple-targets-extension-loader" section after prebuild) —
# evaluated inside this target's own `target 'credentials-provider' do ... end`
# block. ClibsodiumXCFramework.podspec is (re)generated next to this file by
# plugins/withCredentialsProviderPod.js on every `expo prebuild`.
#
# :path (development-pod mode), not :podspec — :podspec makes CocoaPods try
# to actually fetch `s.source` (git clone etc.), which makes no sense for a
# vendored binary that's already sitting right here; :path treats this whole
# directory as the pod's local root and skips fetching entirely.
pod 'ClibsodiumXCFramework', :path => __dir__
