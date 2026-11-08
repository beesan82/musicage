/**
 * Local config plugin: adopt the iOS scene lifecycle.
 *
 * Why this exists:
 * Apps linked against the iOS 26+ SDK that do not adopt the scene
 * lifecycle are terminated by UIKit when the first scene is created
 * (`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`,
 * EXC_BREAKPOINT shortly after process launch). The stock Expo
 * SDK 57 project does not adopt scenes anywhere:
 * - the bare template's Info.plist has no `UIApplicationSceneManifest`,
 * - the template AppDelegate creates a scene-less `UIWindow` in
 *   `application(_:didFinishLaunchingWithOptions:)`,
 * - `ExpoAppDelegate` implements no scene configuration methods, and
 * - no default config plugin adds a scene manifest.
 *
 * This plugin performs the minimal adoption, entirely at prebuild time
 * (the generated `ios/` folder is never edited by hand):
 * 1. Adds a `UIApplicationSceneManifest` to Info.plist with a single
 *    window scene configuration whose delegate is the app module's
 *    `SceneDelegate`.
 * 2. Creates `SceneDelegate.swift` in the app target. It owns the
 *    window, attaches it to the connecting window scene, and asks the
 *    app delegate to start React Native in it.
 * 3. Rewrites the template AppDelegate so `didFinishLaunching` only
 *    prepares the React Native factory and stores the launch options;
 *    window creation moves to `startReactNative(in:)`, which the
 *    scene delegate calls when the scene connects.
 */
const {
  withInfoPlist,
  withAppDelegate,
  IOSConfig,
} = require('expo/config-plugins');

const SCENE_DELEGATE_SWIFT = `import UIKit

/// Scene delegate created by the \`withSceneLifecycle\` config plugin.
///
/// The window must belong to the connecting window scene, so it is
/// created here rather than in \`application(_:didFinishLaunchingWithOptions:)\`.
/// React Native itself is started by the app delegate's
/// \`startReactNative(in:)\`, keeping the factory setup in one place.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      appDelegate.startReactNative(in: window)
    }
  }
}
`;

/** Adds the scene manifest to the generated Info.plist. */
const withSceneManifest = (config) =>
  withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });

/** Creates SceneDelegate.swift in the app target and links it to the project. */
const withSceneDelegateFile = (config) =>
  IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: 'SceneDelegate.swift',
    contents: SCENE_DELEGATE_SWIFT,
    overwrite: true,
  });

/**
 * Rewrites the template AppDelegate for scene-based window ownership.
 * Throws when the template text does not match, so a future template
 * change fails prebuild loudly instead of silently generating an app
 * whose manifest points at a window flow that does not exist.
 */
const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error(
        '[withSceneLifecycle] Expected a Swift AppDelegate, got: ' +
          config.modResults.language,
      );
    }
    let contents = config.modResults.contents;

    const replaceOnce = (anchor, replacement, label) => {
      if (!contents.includes(anchor)) {
        throw new Error(
          `[withSceneLifecycle] AppDelegate template anchor not found: ${label}`,
        );
      }
      contents = contents.replace(anchor, replacement);
    };

    // Store the launch options on the app delegate. Depending on the
    // launch sequence, the scene may connect before or after
    // `didFinishLaunching` runs, so the options must outlive it to be
    // forwarded to the React Native factory when the start happens.
    replaceOnce(
      '  var reactNativeFactory: RCTReactNativeFactory?\n',
      `  var reactNativeFactory: RCTReactNativeFactory?

  /// Launch options captured in \`application(_:didFinishLaunchingWithOptions:)\`.
  /// With the scene lifecycle the window is created by \`SceneDelegate\`,
  /// so the options are kept here and forwarded to the factory
  /// in \`startReactNative(in:)\`.
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  /// Guards \`startReactNative(in:)\` so React Native is started
  /// exactly once, whichever of the scene connection and
  /// \`didFinishLaunching\` completes the prerequisites last.
  private var didStartReactNative = false
`,
      'reactNativeFactory property',
    );

    // Stop creating a scene-less window and starting React Native at
    // launch; the scene delegate owns the window now.
    replaceOnce(
      `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`,
      `    // The window belongs to the connecting window scene, so it is
    // created by SceneDelegate (see SceneDelegate.swift), which then
    // calls startReactNative(in:). Keep the launch options for that.
    self.launchOptions = launchOptions
    if let window {
      // The scene connected before the factory was ready; its window
      // is already stored, so start React Native in it now.
      startReactNative(in: window)
    }
`,
      'window creation in didFinishLaunchingWithOptions',
    );

    // Expose the start entry point the scene delegate calls.
    replaceOnce(
      '  // Linking API\n',
      `  /// Starts React Native in the window owned by the connecting
  /// scene. Called by \`SceneDelegate\` once the window scene exists.
  /// If the factory is not ready yet (the scene connected before
  /// \`didFinishLaunching\` prepared it), the window stays stored and
  /// \`didFinishLaunching\` starts React Native in it instead.
  func startReactNative(in window: UIWindow) {
    self.window = window
    guard !didStartReactNative, let reactNativeFactory else {
      return
    }
    didStartReactNative = true
    reactNativeFactory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
  }

  // Linking API
`,
      'Linking API section',
    );

    config.modResults.contents = contents;
    return config;
  });

const withSceneLifecycle = (config) => {
  config = withSceneManifest(config);
  config = withSceneDelegateFile(config);
  config = withSceneAppDelegate(config);
  return config;
};

module.exports = withSceneLifecycle;
