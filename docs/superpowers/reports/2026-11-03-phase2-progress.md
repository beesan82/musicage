# フェーズ 2 進捗（2026-11-03 時点）

計画: `docs/superpowers/plans/2026-10-19-lyric-typography-phase2.md`
ブランチ: `claude/lyric-typography-phase2`（`origin/master` の `70d0ee5` から分岐）
実行方法: superpowers:subagent-driven-development。各タスクを実装役が書き、別のレビュー役が仕様適合と品質を確かめた。

## タスクの状態

| タスク | 状態 | コミット |
| --- | --- | --- |
| Task 0 所有者の手順 | 済み。App ID・ShazamKit・端末登録・Apple ログインは 2026 年 9 月の ShazamKit 版で実施済みだったことが分かり、既存の EAS プロジェクトを引き継いだ。`expo-dev-client` と `eas-cli` は所有者が 2026-10-20 に入れた | `3e27122`、`5636473` |
| Task 1 EAS 設定 | 完了・レビュー済み | `831fd86`、`3e27122`、`5636473`、`26d3937` |
| Task 2 耳モジュールの JS 契約 | 完了・レビュー済み | `8196da1` |
| Task 3 Swift の耳モジュール | 完了・レビュー済み。**未コンパイル** | `66bf1bd`、`eae721f` |
| Task 4 EarStream と useEar | 完了・レビュー済み | `b8e7302` |
| Task 5 型の置き換えと AudD・校正系の削除 | 完了・レビュー済み | `d23aa8d` |
| Task 6 認識フックと自動再認識 | 完了・レビュー済み | `6042488`、`f04342a` |
| Task 7 設定と操作列 | 完了・レビュー済み | `972c942`、`51292d1` |
| Task 8 舞台への配線と README | 完了・レビュー済み | `f63df41`、`ac41d93` |
| Task 9 EAS ビルドと実機確認 | **未着手**（所有者が `eas build --platform ios --profile development` を実行するところから） | — |
| ブランチ全体の最終レビュー | **未実施**（Task 9 の後に行い、下の「後回しにした指摘」の扱いを決める） | — |

最後に確認した状態（`26d3937`）: `npm test` 42 スイート 276 件すべて通過、`npm run typecheck` 通過。`npx expo config --type public` で bundle ID・projectId・owner を確認、`expo-modules-autolinking search --platform apple` で `expo-musicage-ear` が見つかることを確認。

## 計画から変えた判断（Ruling）

1. **tsconfig**: `modules/**/*.ts` を `include` に足す作業を Task 1 から Task 2 に前倒しした（Task 1 が当時進められなかったため）。
2. **README の `start:go`**: Task 1 より先に README に書いた。今は Task 1 で `package.json` に入っている。
3. **自動再認識の発火条件**: 「最終行 + 15 秒」の発火を「無音 → 音」の発火と独立にした。式は `enabled && !recognizing && ((armed && previousSilence && !silence) || (pastOutro && !previousPastOutro && !silence))`。計画どおりの式では計画自身のテストが通らないため。外れた場合、曲の終わりに認識が 1 回余分に走る。
4. **Shazam ID が無いマッチ**: 計画は空文字を送る指定だったが、ネイティブ側で `invalid_match` エラーにした（JS 側も空の ID を同じエラーにするので外から見た挙動は同じ）。
5. **app.json のマイク文**: Task 5 で AudD の記述を消し、Task 1 で最終の文に置き換えた。
6. **設定ファイル**: 書き込みが失敗しても例外を出さず、メモリ上の値はその回だけ有効にする。書き込む前にファイルが無ければ作る（SDK 57 で `write` がファイルを作るか確かめられなかったため）。
7. **針を上げたとき**: 認識済みの曲で無音が 4 秒続いたら idle 構成に戻す（計画の実装には無く、README と設計書の受け入れ条件 4 が求めていたのでコードを直した）。外れた場合、曲中の 4 秒以上の静かな部分で、音が戻るまで歌詞が消える。
8. **Task 1 の分割**: 所有者の操作が要る 2 つの確認（`expo-dev-client` と `projectId`）を後から足した。
9. **EAS プロジェクトの引き継ぎ**: `eas init` をせず、既存の projectId（`4565a0df-…`）と owner `beesan` を `app.json` に入れ、`eas.json` を `appVersionSource: remote` にした。
10. **設定の読み込み前は自動再認識を止める**: 保存した「オフ」が起動直後の既定「オン」で上書きされるのを防ぐため。
11. **起動直後の無音扱い**: 拍エンジンは起動直後 500ms ほど無音と判定しないため、最初に音が聞こえるまで舞台側で無音とみなす（起動直後の誤った自動認識を防ぐ）。

## 実機で確認すること（Task 9 と合わせて）

README の「Device validation」の 9 項目に加えて:

- 初回起動のマイク許可ダイアログで、許可が捨てられてマイクのボタンを 1 回押す必要がないか（ダイアログ中にアプリが inactive になるため）。
- `.playAndRecord` + `.mixWithOthers` の音声セッションが、同じ iPhone で他のアプリが鳴らす音の経路や音量を変えないか。
- `predictedCurrentMatchOffset` と `matchOffset` のどちらが使われたか、`artworkUrl` が取れるか。
- 曲が切り替わる瞬間に、前の曲の行番号で 1 フレームちらつかないか。

## 後回しにした指摘（最終レビューで残すか直すかを決める）

ネイティブ（Swift）
- 起動処理が `setActive(true)` の後で失敗すると、オーディオセッションが有効のまま残る。
- 音声経路の変更（AirPods の接続など）に対応していない。中断から戻ってエンジンを再開しても JS に通知しない。
- タップのスレッドが 20ms ごとに NSLock を取り、クロージャを 1 つ割り当てる。
- `vDSP_create_fftsetup` 失敗時に `fatalError`。失敗可能な init にすれば `audio_setup_failed` を返せる。

JS の耳と認識
- `useNativeEar`: `audio_setup_failed` / `interrupted` で error に入るとき、ネイティブを止めていない。`requesting` 中のフレームは捨てる（計画どおり）。
- `useEar` は条件付きでフックを呼ぶ（計画どおり。lint は未設定）。テストはメーター側だけ。
- `index.ts` の `addErrorListener` がネイティブのエラーをそのまま渡す（`{ code }` だけに写すべき）。`clockConverter` は `samples <= 0` を `?? 0` で隠している。
- `useEarRecognition`: 呼び出し側が listening 中にだけ `recognize()` を呼ぶ前提。ネイティブのイベントに試行 ID が無く、取り消し直後の遅い `match_timeout` が次の試行に当たりうる。`resolving_lyrics` 中のエラーで LRCLIB の要求を中断しない。同じ試行で 2 回目の認識が来ると検索が 2 回走る。

設定と舞台
- 設定の初回読み込み前の `update` は読み込み結果で上書きされる（UI は `ready` まで切り替えを無視しているので実害は小さい）。
- 歌詞の行が変わった直後の 1 回の描画で、前の曲の行番号が新しい曲に当たる可能性がある。
- 起動直後の無音扱いは舞台側にある。拍エンジンの初期状態を無音にする方が筋がよい。拍の間引きに末尾の公開が無い。
- マイクを止めている間、認識済みの曲は時計どおりに進み続ける（所有者が選んだ状態なので許容）。

テストの抜け
- 無音 4 秒のタイマーが途中の物音でやり直すことのテスト、無効な状態のボタンが `onRecognize` を呼ばないことのテスト、設定ファイルのパスの確認、読み込み前のアンマウントなど。

その他
- `expo-crypto` は校正系の削除で使われなくなった。所有者が `npm uninstall expo-crypto` で外す（依存の変更は所有者のコマンドで行う）。
- `expo-secure-store` はフェーズ 3 の Claude API キー保存に使うので残す。

## 次にやること

1. 所有者: `eas build --platform ios --profile development` を実行し、iPhone に入れて README の「Device validation」と上の項目を確かめる。ビルドが失敗したらビルドページの Xcode ログを渡す。
2. エージェント: ビルドエラーがあれば Swift を直す。実機の結果を `docs/superpowers/reports/` に記録する。
3. エージェント: ブランチ全体の最終レビュー（最も能力の高いモデルで）を行い、後回しにした指摘を直すか残すか決める。
4. 所有者の確認後、pull request で `master` にマージする。
5. フェーズ 3（Claude API の演出ディレクター）の計画を設計書から書く。
6. 配布を TestFlight にするか（EAS Submit か Codemagic か）は所有者の判断待ち。

## 追記（2026-11-04）: 起動即死クラッシュの真因（シーンライフサイクル未対応）の修正

- 発端: Codemagic の TestFlight 配布ビルド（0.1.0 (1)）が実機で起動した瞬間に終了した。本人の iPhone から取得した .ips ログで確定した診断: 例外は EXC_BREAKPOINT (SIGTRAP)、起動から約 0.24 秒後、メインスレッド。最上位フレームは UIKitCore の `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke` で、`-[UIApplication workspace:didCreateScene:...]` の呼び出し中。iOS 27 が「シーンライフサイクル（UIScene）を採用していないアプリ」をシーン生成時点で強制終了していた。JS バンドル評価・耳モジュール・テクスチャシェーダには到達していない（先の追記のテクスチャ候補はこのクラッシュの原因ではなかった）。
- 原因の特定根拠（生成される Info.plist に `UIApplicationSceneManifest` が入らない理由）:
  - 最終 Info.plist は「テンプレートの Info.plist ＋ app.json の `ios.infoPlist` ＋ プラグインの withInfoPlist 結果」で決まるが、どれにもシーン manifest が無い。
  - Expo SDK 57 の標準テンプレート（expo-template-bare-minimum@57.0.33 を取得して確認）の Info.plist に `UIApplicationSceneManifest` は無く、AppDelegate.swift は classic 形式（didFinishLaunching で `UIWindow(frame:)` を作り即 RN 起動）。
  - @expo/config-plugins 57.0.9 全体と @expo/prebuild-config のデフォルト iOS プラグイン一覧（withIosExpoPlugins）に、シーン manifest を追加するものは無い。
  - expo 57.0.20 の `ExpoAppDelegate.swift` に `application:configurationForConnectingSceneSession:` の実装が無い。`UIWindowSceneDelegate` に適合するクラスは依存パッケージのどこにも存在しない。
  - MUSICAGE の app.json の infoPlist 上書きにも無く、採用プラグイン（expo-audio 等）にも無い。`npx expo config --type prebuild` の ios.infoPlist にも現れない。
  - 決め手として、修正前のプロジェクトを実際に prebuild して生成物を確認した: 生成された Info.plist に `UIApplicationSceneManifest` は 0 件、SceneDelegate.swift は存在せず、AppDelegate は classic 形式のままだった。つまり現行構成では構造的にシーン対応が生成されず、Xcode 27（DTAppStoreToolsBuild 27B52）で iOS 27 SDK にリンクされたビルドが実機のシーン生成で終了する。
- 修正（ブランチ `fix/ios-scene-lifecycle`、feat/codemagic-testflight から分岐、push は所有者の承認待ち）: ローカル config plugin `plugins/withSceneLifecycle.js` を新設し、app.json の plugins に `./plugins/withSceneLifecycle` を追加。生成物 ios/ の手編集はしていない。plugin の内容:
  1. withInfoPlist で `UIApplicationSceneManifest` を追加（複数シーン不可、構成名 "Default Configuration"、delegate は `$(PRODUCT_MODULE_NAME).SceneDelegate`）。
  2. `IOSConfig.XcodeProjectFile.withBuildSourceFile` で `SceneDelegate.swift` をアプリターゲットに生成・リンク。window を接続中の windowScene で作り、AppDelegate の `startReactNative(in:)` を呼ぶ。
  3. withAppDelegate でテンプレートの AppDelegate.swift を最小改変: didFinishLaunching は factory の準備と launchOptions の保持だけにし、window 生成と RN 起動を `startReactNative(in:)` に分離。シーン接続と didFinishLaunching の前後どちらの順でも、また二重起動にならないようガード付き。テンプレート文面が変わってアンカーが見つからない場合は prebuild をエラーで止める（黙って壊れた生成物を出さない）。
- ローカル検証（この環境は Linux で Swift のコンパイルはできないため、生成物の確認まで）:
  - 修正後を実際に prebuild して確認: 生成 Info.plist に `UIApplicationSceneManifest` が入り（中身も上記のとおり）、`SceneDelegate.swift` が生成され project.pbxproj の Sources にリンクされ、AppDelegate.swift が意図どおり書き換わった。
  - `npm test -- --watchman=false`: 42 suites / 276 tests 全通過。`npm run typecheck`: 通過。
  - Swift のコンパイル自体は未検証。Codemagic か EAS のビルドが通るまでは「未検証」として扱う。
- 実機で確認すること:
  1. この修正入りビルドを TestFlight で再配布し、実機で起動して即死せず、舞台（idle 構成）が表示されること。あわせて Task 9 の Device validation。
  2. 開発ビルド（expo-dev-client）でも起動と dev launcher の表示が壊れていないこと（window の生成タイミングがシーン接続時に変わるため）。
  3. スプラッシュ表示から舞台への遷移、画面の向き（縦固定）、ダークな見た目が従来どおりであること。
- 次にやること: 所有者承認後に push し、フェーズ 2 ブランチへの取り込み方を決めて再ビルド → TestFlight 再配布 → 実機確認。テクスチャ遅延初期化のブランチ（fix/texture-shader-lazy-init）とは独立で、混ぜていない。

## 追記（2026-11-05）: アプリアイコンの設定（B案「ターンテーブル」）

- 発端: アイコンが未設定で、実機ではデフォルトのアイコンになっていた（所有者から「もっとかっこよく」との指摘）。
- 選定: 候補6案（第1弾：レコード＋言葉／大きな「音」＋散布／ミニマルなレコード、第2弾：波形／ターンテーブル／朱に「歌」／M＋波形）を描画して提示し、所有者が第2弾の「ターンテーブル」を選択（2026-11-05）。明るい生成りの地に黒いレコード盤・赤いラベル・トーンアームで、「レコードのそばに置くオブジェ」という製品コンセプトに直結する案。
- 実装: バイナリ素材は GitHub コネクタのスナップショット push を運べないため、他のプロジェクトと同じ「ビルド時に生成」方式にした。`scripts/generate_icon.py`（Pillow でプログラム描画、1024x1024・RGB）が正本で、`codemagic.yaml` の prebuild 直前のステップで `assets/icon.png` を生成する。app.json に `"icon": "./assets/icon.png"` を追加。生成 PNG 自体はコミットしない。
- ローカル検証: スクリプトを実行し、承認済み候補 B と同一の絵柄・1024x1024・RGB であることを確認。`npx expo config` で icon パスが解決されることを確認。
- 実機で確認すること: 再ビルド（ビルド番号 3）配布後、ホーム画面と TestFlight で新しいアイコンが表示されること。

## 追記（2026-11-07）: 「ノリノリ化」所有者決定・設計書改定・実装計画の作成

- 所有者決定（2026-11-07）: Fable による多角的改善分析（`docs/superpowers/reports/2026-11-07-groove-analysis.md`）の **第 2 階梯まで含めて進める** ことを所有者が決定した。第 2 階梯 = 認識確定の「ドロップ」演出、サビ相当の盛り上がり検出＋強いグロー、パレットの連続変化、小節頭推定、テクスチャのクロスフェード。第 3 階梯（音量で文字の大きさを直接変える／擬似的な語・音節単位の同期／拍頭で全面が光るフラッシュ）は引き続き禁止のまま。
- 設計書の改定（`docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`、分析 §9 の一覧表に対応する最小限の書き換え。改定箇所には「（2026-11-07 改定）」の注記と、状態の節に改定履歴を入れた）:
  - アンチゴール: 「点滅」を定義（1 秒に 2 回以上の頻度 × 振幅 20% 超）。そのうえで (a) 認識確定の 1 回限りの遷移、(b) 拍頭グロー、(c) サビ相当区間の上限引き上げを条件付きで認める形に緩和。全面フラッシュの禁止と、音量で大きさを直接変えることの禁止を明記して維持。
  - 非ゴール: 「単語単位の同期」に擬似的な語・音節同期も含むと明記（維持）。
  - §3 拍エンジン: 小節頭の推定を導入。`bar` は推定した小節頭から数え、推定できない間は従来の 4 拍カウント。出力に `barConfidence` を追加。
  - §4 演出ディレクター: `accent` の意味を「サビ相当の行」に明記。`palette` に任意の第 2 アクセント `accentHigh` を追加。「盛り上がり区間」の定義（`accent` 行と音響検出の OR、信頼度が低い間と無音明け直後は判定しない）を追記。
  - §5 組版エンジン: 拍頭グローの上限（ぼかし半径 10px 以下、対象は強調文字最大 3 文字、一過性の減衰のみ、常時グローなし）と、盛り上がり区間での上限引き上げを追記。
  - §6 背景シェーダー: 質感は 4 種のまま、各シェーダ内部でのエネルギーに応じたクロスフェードを許可。`ink` / `accent` の連続変化はゆっくりした追従値に乗せ振幅をわずかに留める条件を追記。
  - §7 画面と操作: 認識確定の 1 回限りの遷移（ドロップ）を追記。条件は長さ 1〜2 秒以内・ラベルなし・同じ trackId の再錨では発火しない。
  - 変えていない決まり: 音声を外に送らない、実在曲の歌詞を入れない、ラベルを描かない、ペット・実績・共有ボタンを足さない、常時表示の作法。
- AGENTS.md の要約も改定後の原則に合わせて 1 行だけ更新（「置物として静かに保つ」→ 認める演出を列挙し、第 3 階梯の禁止を明記）。作業の決まり部分は無変更。
- 実装計画の作成: `docs/superpowers/plans/2026-11-07-groove-plan.md` を新規作成。段階 1 = スライス A（拍の連続量配線、idle 再配置の見直し＋横倒し廃止＋無音で bar 凍結、hold 振幅増＋low 連動、テクスチャ uniform 拡張）、段階 2 = スライス B（退場、予備動作つき入場、文字波と強調の移り、太さ）、段階 3 = ドロップ、段階 4 = 小節頭推定、段階 5 = 盛り上がり検出＋グロー＋パレット連続変化、段階 6 = テクスチャのクロスフェード。各段階に範囲／触るファイル／テスト／実機確認項目／前提を記載。
- 今回はドキュメントのみで、アプリのコード（`src/`・`modules/`）は無変更（git status で確認済み）。push はしていない。
- 次にやること: 段階 1（スライス A）から実装に着手する。段階 3 以降は設計書改定済みが前提で、段階 2 までの実機所見を見て順序を調整してよい。

## 追記（2026-11-07）: ノリノリ化・段階 1（スライス A）の実装

ブランチ `feat/groove-stage1`（`docs/groove-tier2` から分岐）。計画書の段階 1 の 4 項目をすべて実装した。TDD で進め、各項目とも先にテストを書いて失敗を確認してから実装した。

- 拍の連続量配線: `useBeatSharedValues` を「購読するたび React state 経由」から「`write(frame, state)` で全フレーム書き込むバンドル」に作り替えた。所有権は `useStageSource` に移し、耳の 20ms フレームごとに（React 公開の 60ms スロットルの手前で）shared value へ直接書く。書き込むのは pulse / phase / bar / confidence / energy に加え、`lastOnsetAtMs`（pulse の立ち上がりエッジ＝拍頭のステージ時計時刻）、`nextBeatAtMs`、`periodMs`、そして帯域エンベロープ（low / mid / high、アタック 20ms・リリース 150ms の平滑）。worklet 側（`motion.ts`）はこれらから連続量を導出する: pulse は拍頭からの指数減衰（τ=120ms）、phase はグリッド（nextBeatAtMs / periodMs）から連続計算。旧来の 60ms 刻みの階段状・遅延は解消された。
- idle 再配置の見直し: `composeIdle` のシグネチャを `(epoch, barInEpoch, …)` に変え、構成は 8 小節のエポックで固定（`IDLE_EPOCH_BARS = 8`）。小節ごとに 1 文字だけ 'rise' で差し替える（累積式、現在の文字を除外して再抽選するので必ず見た目が変わる）。差し替え文字は `index = 1000 + epoch*8 + barInEpoch` の専用レイヤーで描き、エポック開始時刻を基準に rise する（本体レイヤーはエポック中ずっと安定）。数字・長音の 90° 横倒し（`rotateDeg`）は全構成で 0 に廃止。整列モード（3 文字が一直線）も追加（分析 §6.3）。無音中は `useStageSource` が最後に音があったときの bar で公開値を凍結し、idle 構成が静止する。
- hold の振幅増＋low 連動: hold のスケール振幅を旧 2〜8% から `(0.06 + 0.06·low)·feel·pulse`（強調文字 1.6 倍）に拡大し、拍頭直前の anticipation（位相の最後 15% で最大 −2%）を追加。breathe は `(0.02 + 0.02·low)` で、グリッド位相＋セル位置（`PlacedGlyph.phaseOffset`、任意フィールドとして追加）による行・列の波を入れた。drift の振幅も `2 + 4·low` px。`feel` は未使用だった `tempoFeel` から `TEMPO_FEEL_FACTOR`（still 0.5 / sway 1.0 / march 1.3 / drive 1.6）で曲ごとに変わる。拍由来の hold（pulse / shake / breathe）はすべて confidence < 0.5 で 0.25 倍に減衰。**音量そのものは大きさに直結させていない**（low はエンベロープの味付けとドリフト・呼吸の振幅のみ。設計書のアンチゴール維持）。
- テクスチャ uniform 拡張: プリリュードに `iLow / iMid / iHigh / iConfidence` を追加し、`TextureBackground` が（任意 props、未指定時は帯域 0・confidence 1 で従来互換）uniform へ渡す。4 シェーダ共通の拍の持ち上げを `iPulse * 0.04` → `iPulse * iConfidence * 0.06` に変更し、帯域連動を入れた: grain は粒の粗さが iHigh、paper は繊維の張りが iLow、scan は線の深さが iMid＋位相ずれを confidence でゲート、void は中央の持ち上げが iLow×iConfidence＋広がりが iEnergy。
- 判断（仕様の隙間への最小解釈、報告用）:
  1. 分析 §6.2 のグリッド位相 breathe の波は、GlyphLayer がビューポート／セル位置を持たないため、`PlacedGlyph` への任意フィールド `phaseOffset` 追加で受け渡した（計画の「PlacedGlyph の形は変えず」は差し替え機構の文脈と解釈し、差し替えは index トリックどおり維持）。
  2. idle の整列モードは §6.3 の文字どおり「3 文字・一直線」とした（文字数を保存する解釈は採らなかった）。
  3. 「xl 相当は振幅 0.5 倍」の特例は、motion へサイズ段階を渡す経路が計画に無いため見送り。§3.4 の letter-spacing の dx も計画の motion 項目に無いため見送り（段階 2 以降で扱うなら計画改定が要る）。
- 検証: `npm test -- --watchman=false` は 42 suites / 294 tests 全通過（段階 1 着手前のベースライン 276 件から +18 件）。`npm run typecheck` 通過。Swift・ネイティブの変更はなし。
- 実機で確認すること（段階 1 分）:
  1. 静かな部屋で idle が静止し続けること（無音で bar が凍結し、文字が勝手に差し替わらない・揺れない）。
  2. 音楽を流すと idle が呼吸し、1 小節に 1 文字だけ rise で差し替わること。数字・長音が横倒しにならないこと。
  3. フィクスチャ曲・実曲で hold の弾み（拍頭の跳ね）が体感できること。バラード（still）と速い曲（drive）で振幅の差が出ること。
  4. 背景のきらめきが拍の確信度に連動し、確信が低い場面で暴れないこと。
  5. FIX ピル表示時と実機で fps が 55 以上を保つこと。idle を 10 分放置しても発熱しないこと。
- 次にやること: 段階 2（スライス B: 退場、予備動作つき入場、文字波と強調の移り、太さ）。push はしていない（ローカル commit のみ）。


## 追記（2026-11-07）: ノリノリ化・段階 2（スライス B）の実装

ブランチ `feat/groove-stage2`（`feat/groove-stage1` から分岐）。計画書の段階 2 の 4 項目をすべて実装した。TDD で進め、各項目とも先にテストを書いて失敗を確認してから実装した。

- 退場の振り付け: `motion.ts` に exit を追加し、entrance から決定的に導く（`exitForEntrance`: drop→fall（下へ落ちる）、rise→rise（上へ抜ける）、scatter→散る、trace→末尾から消える、fade→薄れる、cut→即消し）。退場の長さ（`exitDurationMs`）は拍グリッドがあるとき 1 拍以内に収まるよう周期で上限をかける。`LyricStage` は `lineScene` を「現在行＋退場中」の 2 枚持ちにし、行交代で前の行を退場レイヤー（`testIDPrefix: 'exit-glyph'`、現在行の下に描画）として残し、退場の長さ＋80ms で落とす。退場中も hold は掛けず、退場の変形だけが走る。reducedMotion のときは退場レイヤー自体を出さない。
- 予備動作つき入場: `lineScheduler` に `LANDING_WINDOW_MS = 250` を追加。前方切替で次の拍頭が 80ms 以内なら従来どおり待ち、80〜250ms 先なら行を即確定して `ScheduledLine.landsAtMs` に拍頭を併記する（`confidence ≥ 0.5` のときだけ。巻き戻しには付けない）。歌詞時刻そのものは動かさない（設計書 §5 の ±80ms の考え方は維持し、先読みは着地の準備にだけ使う）。`landsAtMs` は `useStageSource` → `StageSource.scheduled` → `GlyphLayer` へ無加工で届く（受け渡しの統合テストを追加）。`motion.ts` では着地に錨を打った入場の spring を再パラメータ化し、拍頭（elapsed 0）でちょうどグリフが定位置を横切るようにした。着地前はグリフが定位置へ寄りながら scale が最大 −8% 沈む（crouch）。`scatter` の文字ずらしは固定 40ms をやめ、拍グリッドがあるときは 1 拍（9 文字以上は 2 拍）を 16 分音符に量子化して割り当てる（グリッドが無いときは従来の 40ms）。
- 行内の文字波と強調の移り: hold `pulse` の pulse を文字順にずらし、1 拍かけて行内を波が渡るようにした（`derivePulse(time − (index/count)·period)`。歌の進みとは一致させない装飾で、グリッドが無いときは波なし）。強調の移りは `GlyphLayer` の `color` を `useDerivedValue`＋`interpolateColor` に変更し、行の経過率 0→1 で強調文字が順に accent 色へ移る。行の終わりは次行の `startMs` から舞台時計へ換算して `lineEndsAtMs` として渡す（次行が無い行は従来どおり accent 色で固定）。
- 太さ: 太い行（`weight === 'bold'` または `font === 'gothic-heavy'`、判定は `LyricStage`）に限り、`GlyphLayer` が塗りの下に同色ストロークの双子を重ね、`strokeWidth` を `sizePx·0.02·pulse·low`（confidence < 0.5 では 0.25 倍）で連続制御する。対象を太い行に限ることでグリフ描画の 2 倍化を局所化した（fps は実機で要確認）。
- 判断（仕様の隙間への最小解釈、報告用）:
  1. 分析 §3.2 の予備動作の式は符号と「0.96→1.02→1」の内訳が一意に読めなかったため、計画のテスト条件（予備動作区間で scale < 1、着地で定位置・不透明度 1）を満たす形として、spring の引数を「着地で spring が初めて 1 に達する」よう写像し直す解釈を採った。着地後の settle は従来の ENTRANCE_DURATION_MS の範囲で同じ spring が続く。
  2. `lineEndsAtMs` は計画の文言（「次行の startMs を渡す」）をそのまま舞台時計の値として渡すと時計系が混ざるため、`lineStartedAtMs + (次行.startMs − 現在行.startMs)` に換算して渡した（行は実時間で進む前提）。
  3. 退場レイヤーには前後行（context）と Ornament は含めない（退場するのは主行のグリフだけとした）。退場中レイヤーの強調色は移りなし（accent 色で固定）。
  4. 段階 1 の `phaseOffset` 受け渡しや hold の形には触れていない。`useStageSource.ts` 本体は無変更（`landsAtMs` はスケジューラの戻り値に乗って自然に届くため、受け渡しのテストだけを追加した）。
- 検証: `npm test -- --watchman=false` は 42 suites / 333 tests 全通過（段階 2 着手前の 294 件から +39 件: lineScheduler +6、motion +16、GlyphLayer +7、LyricStage +3・既存 2 件を新仕様に更新、useStageSource +1）。`npm run typecheck` 通過。Swift・ネイティブの変更はなし。
- 実機で確認すること（段階 2 分）:
  1. 行の交代で前の行が即消えせず、その行の入り方に応じた向き（drop→下、rise→上、scatter→散り、trace→末尾から）で 1 拍以内に退場すること。
  2. 行が拍頭に「着地」する感触があること（着地前にグリフが寄って沈む予備動作が見えること）。先読みが外れた場面（confidence が低い曲）で歌詞時刻とのずれが気にならないこと。
  3. 強調色が行の経過に沿って文字順に移ること。
  4. 太ゴシック（gothic-heavy）の行で拍頭に文字が膨らむこと。太い行でも fps 55 を割らないこと（グリフ描画が 2 倍になるため特に要確認）。
  5. scatter の行で文字が拍の分割に乗って現れること（速い曲・遅い曲の両方で）。
- 次にやること: 段階 3（認識確定のドロップ）または段階 4（小節頭推定）。どちらも段階 2 の退場機構・連続量が前提で、順序は実機所見を見て決める。push はしていない（ローカル commit のみ）。

## 追記（2026-11-08）: ノリノリ化・段階 3（認識確定の「ドロップ」）の実装

ブランチ `feat/groove-stage3`（`feat/groove-stage2` の上に作成）。計画書の段階 3 の 3 項目をすべて実装した。テスト先行で進め、4 つのテストファイルに先に失敗するテストを書いてから実装した（ただし本セッションの実行環境ではテスト・typecheck のコマンド実行が承認待ちで走らせられなかった。下記「検証」を参照）。

- 発火の判定（`useStageSource`）: `StageSource` の synced 側に `dropAtMs`（発火時刻、`performance.now()` 基準）を追加した。発火条件は「timestamped の結果の `trackId` が、それまでに見た `trackId` と異なる」こと。前回の `trackId` を ref で覚え、同じ `trackId` の再錨（再認識で同じ曲、針の上げ直し後の同じ曲）では発火しない。synced → idle（`not_recognized` など）でも発火せず、そのあと同じ曲が戻っても発火しない。別の `trackId` なら発火する。idle 側の `StageSource` は無変更。
- 舞台側の振り付け（`LyricStage`）: 発火時刻ごとに 1 回だけ、描画中に `Drop` を組み立てる（拍頭 `headMs`、発火時に舞台にあった idle グリフ、その散りが終わる時刻 `idleRiseAtMs`、ドロップで入る行）。
  1. idle グリフの退場: 発火時に表示していた idle 構成（直前の描画で表示していたものを ref で保持）を、段階 2 の退場レイヤーの仕組みに乗せて `testIDPrefix: 'exit-idle-glyph'` で残す。退場の時計を次の拍頭に錨付けし、拍頭までは完全に静止（`motion.ts` の `exitTransform` に「負の経過時間は恒等」を明示）、拍頭から `scatter` の退場（1 拍以内、最大 420ms）で散る。散り終わり＋80ms でレイヤーを外す。
  2. 背景の暗転: `TextureBackground` に `time`（舞台時計）と `dropAtMs` を渡し、プレリュードに `iDrop` uniform と `dropDip(col)` を追加した。4 シェーダとも最終色に `dropDip` を掛ける。`iDrop` は JS の `dropDip(sinceMs)` で、発火から 80ms で 1（黒）に沈み、500ms で 0 に線形に戻る 1 回限りの形（`DROP_DIP_MS = 500`）。発火前・復帰後は 0。
  3. 最初の行の `drop` 着地: 発火後に最初に表示された行だけ、演出の entrance を `drop` に差し替え、拍頭が行開始より先なら `landsAtMs` を拍頭にして段階 2 の予備動作つき入場で着地させる（退場は差し替え後の entrance から導かれるので `fall`）。その行を過ぎたら以降の行には適用しない（`DROP_LINE_DONE`）。
  4. caption 先行: 発火時に最初の行がまだ先（`scheduled.index === -1`）なら、曲名・アーティストの caption を 1 文字ずつ `PlacedGlyph` に展開し、拍頭から `trace` で出す（`testIDPrefix: 'idle-caption-glyph'`、不透明度は従来と同じ 0.6）。trace が終わったら従来どおりの単一 `Text`（`testID: 'idle-caption'`）に戻す。同じ場合、新しい曲の idle 構成は散りが終わった時刻（`idleRiseAtMs`）から `rise` で上がる（React の `key` に発火時刻を含めて rise を再生）。
  5. 拍頭の決め方（`motion.ts` の `dropHeadMs`）: 発火時刻以降の最初の拍頭。古い予測は周期ぶん進めて使う。グリッドが無い／`confidence < 0.5`／拍頭が `DROP_MAX_WAIT_MS = 1000` より先なら待たずに即時。これで待ち（≤1 秒）＋散り（≤420ms）＋行の着地で全体が 2 秒以内に収まる。
  6. reducedMotion のときはドロップ自体を組み立てない（退場レイヤーなし、caption は静的、`iDrop` は 0）。
- ラベルは一切描かない。暗転は 1 回 500ms の一過性で、設計書のアンチゴール「点滅」（1 秒に 2 回以上 × 振幅 20% 超の繰り返し）には当たらない。拍頭での全面フラッシュ（第 3 階梯）は入れていない（暗転のみ、明転はしない）。
- 判断（仕様の隙間への最小解釈、報告用）:
  1. フィクスチャ曲の開始（`playback.active` が false → true）も発火の対象にした。Expo Go でドロップを目視できるようにするため。フィクスチャの停止では発火しない。フィクスチャ再生中に実曲が認識された場合も発火しない（`trackId` は記録するので、フィクスチャ停止後にその曲へ戻ってもドロップしない）。計画の文言は「認識確定」だけなので、不要なら `useStageSource` の `fixtureStarted` の 1 条件を外せば元に戻る。
  2. 分析 5.1 の「背景が 1 拍だけ沈む」は、計画書・依頼の「発火から 500ms」を採り、拍の周期には連動させていない。
  3. 最初の行が遠い場合に idle グリフを散らしたあと舞台が空にならないよう、新しい曲の idle 構成を散り終わりから rise で戻す解釈を採った（設計書の「idle 構成が崩れて組み替わる」の範囲内と判断）。
  4. 拍頭待ちの上限（1000ms）は計画に無いが、設計書 §7 の「1〜2 秒以内」を守るための最小の追加。60 BPM 未満の推定でだけ効く。
  5. 発火の時刻は `useStageSource` の effect で `performance.now()` を取る。スケジューラの tick と同じコミットで state が更新されるので、舞台は「synced ＋ dropAtMs」を 1 回の描画で受け取る。
- 変更ファイル: `src/app/useStageSource.ts`、`src/typesetting/LyricStage.tsx`、`src/typesetting/motion.ts`（`dropHeadMs`、`DROP_MAX_WAIT_MS`、`entranceDurationMs`、負の経過時間の恒等）、`src/typesetting/idleComposition.ts`（`captionText` を切り出し）、`src/textures/textureShader.ts`（`iDrop`、`dropDip`、`DROP_DIP_MS`）、`src/textures/TextureBackground.tsx`、`src/textures/grain.ts` / `paper.ts` / `scan.ts` / `void.ts`。テスト: `src/app/__tests__/useStageSource.test.tsx`（+5）、`src/typesetting/__tests__/motion.test.ts`（+4）、`src/textures/__tests__/TextureBackground.test.tsx`（+4）、`src/typesetting/__tests__/LyricStage.test.tsx`（+5）。Swift・ネイティブの変更はなし。
- 検証: **未検証**。本セッションの実行環境では `npm test -- --watchman=false` と `npm run typecheck`（および `jest` / `tsc` の直接実行）がすべて承認待ちで実行できなかった。コードは目視で型と挙動を確認したが、人が次を実行して結果を本ファイルに追記してほしい。

  ```bash
  npm test -- --watchman=false
  npm run typecheck
  ```

  落ちた場合に疑う箇所: (a) `LyricStage.test.tsx` のドロップ系テストは `glyphTransform` を spy して入力の `elapsedMs` / `anticipationMs` を見る。Reanimated の `useDerivedValue` が再レンダーで再評価されない前提で、新規マウントされる層（退場 idle、caption trace、key 替えの idle）の初回評価だけに依存させている。(b) `TextureBackground` の `iDrop` は `dropFireMs` を deps に入れた derived value で、単一レンダーで検証している。
- 実機で確認すること（段階 3 分）:
  1. 実曲で「曲が分かった」ことが文字の動きだけで伝わること（idle が次の拍頭で散り、背景が一瞬沈み、最初の行が落ちて着地する）。ラベルが出ないこと。
  2. 同じ曲の再認識（針の上げ直し、自動再認識）でドロップが再発火しないこと。認識が外れた直後の再認識でも連続発火しないこと。別の曲に替えたときは発火すること。
  3. 認識がイントロ中（最初の行が先）のとき、caption が trace で現れ、散ったあとの idle が上がり直し、最初の行が来たら `drop` で入ること。
  4. 全体が 1〜2 秒に収まること。遅い曲（60 BPM 付近）で間延びしないこと。
  5. 暗転が OLED で不快でないこと（500ms、1 回だけ）。暗転中に落ちてくる最初の行が読めること。
  6. Expo Go のフィクスチャ開始でもドロップが見えること（判断 1）。
- 次にやること: 人による `npm test` / `npm run typecheck` の実行と結果の追記。通れば段階 4（小節頭推定）へ。push はしていない（ローカル commit のみ）。

## 追記（2026-11-08）: ノリノリ化・段階 4（小節頭の推定）の実装

ブランチ `feat/groove-stage4`（`feat/groove-stage3` の上に作成）。計画書の段階 4 の 2 項目を実装した。テスト先行で `src/beat/__tests__/beatEngine.test.ts` に失敗するテストを先に書いてから実装したが、本セッションの実行環境ではテスト・typecheck のコマンド実行が承認制約で走らせられなかった（下記「検証」を参照）。

- 小節頭の推定（`src/beat/beatEngine.ts`）: 設計書 §3（2026-11-07 改定）のとおり、拍エンジンが 4 拍周期で `low` のオンセット強度を位相（拍番号 mod 4 のスロット）ごとに累積し、最も強いスロットを小節頭とする。
  1. 累積するのは、エンジンがロックしたオンセットごとの `low` 側のオンセット強度（`max(0, low − 直近 100ms の low 平均)`。テンポ推定用の合成強度 `strength` から `low` の項だけを切り出した）。位相の引き込み（phase pull）で拍番号が確定した後に、その拍のスロットへ加える。
  2. ヒストグラムは拍ごとに `exp(−1/32)` で忘れる（約 8 小節の記憶）。スロットの「際立ち」は `(最大 − 2 位) / 最大` で 0..1。
  3. 信頼の決め方: 際立ちが `0.4` 以上で小節頭として採用（ロック）し、採用中は `0.2` を下回るまで保つ（ヒステリシス）。採用には「ロック後に 2 小節分（8 拍）経過」と「そのスロットにオンセットが 2 回以上」を要求し、1 発の大きな音で決めない。テンポの再推定で周期が 10% 以上動いたらヒストグラムを捨てる（拍番号の意味が変わるため）。
  4. `barConfidence` は採用中の際立ち（0.4〜1）、採用なしのとき 0。採用なしの間は従来どおりロック時点から 4 拍ごとの `bar` に落ちる。
  5. `bar` の数え直し: 採用中は `floor((拍番号 − 小節頭スロット) / 4)` を基にするが、**採用・解除・小節頭の切り替えで `bar` を跳ばせない**。切り替え時点の `bar` を保ったまま原点をずらし、次の増分が新しい小節頭に乗る（その 1 小節だけ 4 拍より短い／長い）。`bar` は常に非減少で、1 フレームに 1 しか増えない。
  6. 無音中はオンセットを処理しないので推定は更新されず（一様に減衰するだけで際立ちは不変）、`reset` と時計の跳びでは全部忘れる。
- `BeatState` に `barConfidence: number` を追加（`src/beat/types.ts`。設計書 §3 の出力定義と一致）。`bar` の doc コメントに「推定した小節頭から数える／跳ばない」を明記。`QUIET_BEAT`（`useStageSource`）とテストの `BeatState` リテラル（`lineScheduler.test.ts`、`LyricStage.test.tsx`）に `barConfidence: 0` を足した。
- 消費側（`breathe`、idle の揺れ）: 変更なし。`bar` の消費者はすべて同じ経路（エンジン → `useStageSource`（無音で凍結）→ `useBeatSharedValues.bar` と React の `beat.bar`）を参照しているので、エンジンの `bar` が小節頭に揃えば `motion.ts` の `breathe`（`bar % 2`）、`LyricStage` のエポック（`floor(bar/8)`、`bar % 8`）、`Ornaments` の `numeral`（`bar % 100`）はそのまま推定小節に乗る。位相がずれた（小節頭が切り替わった）ときも、`bar` が跳ばず非減少なので、エポックの巻き戻し、負の数字、差し替えの二重発火は起きない（切り替え直後の 1 小節が伸び縮みするだけ）。`barConfidence` は舞台へは渡していない（計画の範囲外。段階 5 以降で必要なら shared value に足す）。
- 判断（仕様の隙間への最小解釈、報告用）:
  1. 「位相ごとの累積」を「オンセットごとにそのスロットへ `low` 強度を加える」と解釈した（毎サンプルを拍位置で重み付けする形は採らなかった）。
  2. ロック閾値 0.4 は保守的。合成の 3/4 風入力（アクセントが 3 拍ごと）では、最初の数回転でスロットの際立ちが一時的に 0.26 近くまで上がることを手計算で確かめ、それを超えるよう置いた。実曲でキックが 1・3 拍目に等しく入る曲は原理的に区別できないので採用されず、従来の 4 拍カウントのまま（設計書の「信頼が低い間は小節頭なし」どおり）。
  3. `bar` を切り替えで跳ばせない方針は計画に明記がないが、消費側の「破綻しない」確認を実装側で保証する最小の手として採った。
  4. テンポ再ロック時のヒストグラム破棄（10% 以上の周期変化）は計画に無い小さな追加。
- 追加したテスト（`src/beat/__tests__/beatEngine.test.ts`、`describe('bar head estimation …')`。合成列は `syntheticClicks.ts` に `generateAccentedClicks` / `accentTimes` / `weakTimes` を追加）:
  1. 100 BPM・4/4 でアクセントが 0〜3 拍目のそれぞれ（`test.each`）: 16〜20 秒で `bar` がアクセントの拍でだけ 1 増え、弱い拍では増えない。`barConfidence ≥ 0.4` で、窓の間ずっと 0 より大きい。`bar` の増分は常に 0 か 1。
  2. 120 BPM の強さ一定のクリック: 全フレームで `barConfidence === 0`、`bar` は 4 拍ごと（従来カウント）。
  3. 12 秒までの入力: ロック前と 2 小節経過前は `barConfidence === 0`。
  4. 100 BPM・3/4 風（3 拍ごとのアクセント）24 秒: 全フレームで `barConfidence === 0`、`bar` は非減少・1 ずつ、12〜24 秒で 4〜6 小節。
  5. 推定後に 2 秒の無音: `barConfidence` が保たれ、`bar` が跳ばない。
  6. 既存の `reset` と 1 時間ギャップのテストに `barConfidence === 0` を追加。既存の ±3 BPM 追従テストはそのまま。
- 変更ファイル: `src/beat/beatEngine.ts`、`src/beat/types.ts`、`src/beat/__tests__/beatEngine.test.ts`、`src/beat/__tests__/syntheticClicks.ts`、`src/app/useStageSource.ts`（`QUIET_BEAT` のみ）、`src/sync/__tests__/lineScheduler.test.ts`、`src/typesetting/__tests__/LyricStage.test.tsx`。Swift・ネイティブ・舞台側（`motion.ts`、`LyricStage.tsx`、`Ornaments.tsx`、`idleComposition.ts`）の変更はなし。
- 検証: **未検証**。本セッションの実行環境では `npm test -- --watchman=false` と `npm run typecheck` を実行できなかった。人が次を実行して結果を本ファイルに追記してほしい。

  ```bash
  npm test -- --watchman=false
  npm run typecheck
  ```

  落ちた場合に疑う箇所: (a) アクセント付きクリックで弱い拍がオンセット検出の閾値（直近 2 秒の平均 + 2σ）を割ってしまう場合は `generateAccentedClicks` の `weakPeak`（既定 0.4）を 0.45 程度に上げる（推定自体は弱い拍が検出されなくても成り立つが、テスト 2 の「強さ一定」は全拍検出が前提）。(b) テスト 4（3/4 風）で `barConfidence` が一時的に 0 でなくなる場合は、手計算（最大 0.26）より際立ちが大きく出ているので `BAR_LOCK_MARGIN` を上げるか、`BAR_MIN_BEATS` を 12 にする。(c) テスト 1 の 16 秒からの検査窓が早すぎる場合（ロックは約 12.6 秒、再整列後の最初の増分は遅くとも約 15.6 秒の見込み）は `FROM_MS` を 17 秒に。
- 実機で確認すること（段階 4 分）:
  1. 4/4 の実曲（特に 1 拍目のキックが他より強い曲）で、`breathe` と idle の揺れ（1 小節に 1 文字の差し替え、偶数・奇数小節の呼吸の向き）が小節に合って感じること。
  2. 小節頭が外れる曲・3 拍子の曲・キックが 1 と 3 に等しく入る曲で、違和感が従来（4 拍カウント）より悪化しないこと（推定が採用されず従来どおりになるはず）。
  3. 小節頭が途中で切り替わる瞬間に、idle の構成が全部上がり直したり（エポックの巻き戻し）、数字の装飾が逆行したりしないこと。
  4. 段階 1〜3 の実機項目（無音での静止、fps 55 以上）が退行していないこと（拍エンジンはオンセットごとに 4 要素の配列を触るだけで、毎フレームの追加コストはほぼ無い）。
- 次にやること: 人による `npm test` / `npm run typecheck` の実行と結果の追記。通れば段階 5（盛り上がり検出＋グロー＋パレット連続変化）。push はしていない（ローカル commit もこのセッションでは行っていない）。

## 追記（2026-11-08）: テスト安定化（段階 3 のドロップ系テストのフレーク）

ブランチ `feat/groove-stage4` 上で、`src/typesetting/__tests__/LyricStage.test.tsx` の `describe('the recognition drop')` が実行ごとに通ったり落ちたりする（`entrance` が `drop` のはずが `rise`、idle の `elapsedMs` が `-(300+420)` のはずが `0`、など）問題を調べ、テスト側を決定的にした。本番コード（`LyricStage.tsx`、`motion.ts`）とドロップの仕様（設計書 §7、段階 3 の記録）は変えていない。

- 原因（テストの実時間依存。本番コードの競合ではない）:
  1. Reanimated の jest ランタイムは、UI スレッドの仕事を実タイマーで回す。`react-native-worklets` の jest モックは `runOnUI` / `scheduleOnUI` を `setTimeout(…, 0)` で実行し、`useDerivedValue` の mapper の起動・停止（`startMapper` / `stopMapper`）と、`useFrameCallback` の登録とフレームループ（`requestAnimationFrame` も `setTimeout(…, 0)` のモック）がすべてこの経路を通る。
  2. 一方、`useDerivedValue` はマウント時だけ同期的に 1 回評価する（`initialUpdaterRun`）。段階 3 のテストはこの同期評価を `glyphTransform` の spy で捕まえる前提で書いたが、mapper が起動した時点でも同じ worklet がもう 1 回評価される（jest では `mapperRun()` が即時に走る）。その起動タイマーが「いつ」発火するかは実時間次第で、`render` / `rerender` の中の `act` が実 `setImmediate` で譲る間に 1ms 経っていれば発火し、いなければ次の譲りまで持ち越される。
  3. その結果、(a) 最初の idle 描画で積まれた idle 層の mapper 起動が `spy.mockClear()` の後に発火すると、すでに舞台を去った idle グリフの入力（`entrance: 'rise'`、`elapsedMs: 0`）が「新しい行」や「上がり直す idle」の入力に混ざる（報告された 2 つの症状はこれ）。(b) 逆に、`fires once` では行の変更でグリフ部品（`key` はグリフ番号）が再マウントされず mapper の再起動だけが積まれるので、発火が遅れると行の入力が 1 件も記録されない。(c) フレームループが回り始めると舞台時計 `time` が実時間で進み、`elapsedMs` が `-300` からずれる。
- 対処（`LyricStage.test.tsx` のみ）:
  1. ファイル全体を `jest.useFakeTimers()`（`beforeEach`）／`jest.useRealTimers()`（`afterEach`）で回す。既存の `FixtureControl.test.tsx` と同じ流儀。これで Reanimated の UI 側の仕事はテストが明示的にタイマーを進めるまで積まれたままになり、前のテストから実タイマーが漏れることもない。
  2. ドロップの `describe` に `flushUI()`（`jest.advanceTimersByTime(0)` を `act` で包む）を足し、各 `render` / `rerender` の直後に呼ぶ。0ms タイマーだけを 1 回ぶん流すので、積まれていた mapper の起動・再起動が「その描画の `nowMonotonicMs` のまま」評価され、フレームループ（tick 中に積まれた 0ms タイマーは +1ms 後になる）は動かない。idle 描画の直後にも流すことで、idle 層の評価が次の描画の spy に混ざらない。
  3. 実時間待ち（`setTimeout` 600ms / 1000ms）を `jest.advanceTimersByTime(600)` / `(1000)` に置き換えた（`settle()` と、段階 2 の退場テスト）。
- 変更ファイル: `src/typesetting/__tests__/LyricStage.test.tsx` と本ファイル。段階 4 の未コミットの変更（拍エンジンほか）には触れていない。
- 後回しにした指摘（本番コード、今回は触らない）: `LyricStage` と `TextureBackground` の `useFrameCallback` に毎描画で新しい関数を渡しているため、再描画のたびに UI スレッドでフレームコールバックの登録し直しが起きる。動作には影響しないが、`useCallback` で固定すれば無駄が減る。
- 検証: **未検証**。この環境ではテスト・typecheck を実行できない。人が次を実行し、`LyricStage.test.tsx` を数回続けて回して結果を本ファイルに追記してほしい。

  ```bash
  npx jest src/typesetting/__tests__/LyricStage.test.tsx --watchman=false
  npm test -- --watchman=false
  npm run typecheck
  ```

  落ちた場合に疑う箇所: (a) `flushUI()` の後で `line.length` が 0 なら、mapper の起動タイマーが 0ms ではなく 1ms で積まれている（`advanceTimersByTime(1)` に変える）。(b) `fires once` で `exit-idle-glyph` が残るなら、`settle()` の 1000ms 中に退場の削除タイマー（800ms）が `act` の外で発火している（`act(async …)` の中で進めていることを確認）。
- 次にやること: 上の検証が通れば段階 4 の検証に戻る。

## 追記（2026-11-08）: ノリノリ化・段階 5（盛り上がり検出＋強いグロー＋パレットの連続変化）の実装

ブランチ `feat/groove-stage5`（`feat/groove-stage4` の上に作成）。計画書の段階 5 の 3 項目をすべて実装した。テスト先行で進めた（各項目のテストを先に書いてから実装）が、本セッションの実行環境ではテスト・typecheck・git のコマンド実行が承認制約で行えなかった（下記「検証」を参照）。

- 盛り上がり検出（新規 `src/beat/energyProfile.ts`、置き場は拍エンジン側にした。純関数群＋それを組み合わせる小さなトラッカー `createEnergyProfile`）:
  1. レベルは `(energy + low) / 2`（`energy` は拍エンジンの 400ms 追従値、`low` は耳フレームの生値）。耳の 20ms フレームを 100ms に間引いて溜め、**8 小節**（`PROFILE_WINDOW_BARS = 8`、計画の 8〜16 の短い側。周期が無い間は 120 BPM 相当、窓は 8〜32 秒にクランプ）の移動平均を取る。
  2. 曲全体の累積分布は 64 ビンのヒストグラム。移動平均の値が「70 パーセンタイル（上位 30% の境）」を超えた分を、「95 パーセンタイル − 70 パーセンタイル」（下限 0.08）で割って 0..1 の強さにする。`active` は強さ > 0。
  3. **判定中の区間はヒストグラムに入れない**（移動平均の値は窓 1 本ぶん遅れて分布に加わる）。曲の最初のサビは「曲のこれまで」に占める割合が大きく、同時に数えると自分自身で上位 30% から外れてしまうため。
  4. ガード: `confidence ≥ 0.5`、無音明け 8 秒以降（`SURGE_SILENCE_HOLDOFF_MS`）、分布に 16 秒以上の履歴があること（`SURGE_MIN_HISTORY_MS`。履歴は窓 1 本遅れで溜まるので、実際に判定が始まるのは 120 BPM で曲開始から約 32 秒）。無音フレームは移動平均にも分布にも入れない（針を上げた無音がその後の全部を「大きい」にしないため）。1 秒以上の時刻の跳びと `reset()` で全部忘れる。
  5. 歌詞側との OR と平滑: `useStageSource` の耳購読で毎フレーム `profile.push` し、`max(音響の強さ, 現在行が accent なら 1)` を立ち上がり 600ms / 立ち下がり 1500ms の 1 次追従（`smoothSurge`）に掛けて `beatValues.surge`（新設の shared value、0..1）に書く。現在行の `accent` は描画中に ref へ写し、購読側が読む。聴取を止めたら 0 に戻し、別の `trackId` の認識（ドロップと同じ条件）でプロファイルを捨てる（同じ曲の再錨では保つ）。
  6. `ruleBasedDirector`: `accent` の条件を反復 ≥ 3 から **≥ 2** に（`MIN_ACCENT_REPEATS`）。フェーズ 3 の Claude 側プロンプトは触っていない。
- 強いグロー（新規 `src/typesetting/GlowLayer.tsx`、`src/typesetting/surgeColors.ts`）: 現在行の強調文字（最大 3、`GLOW_MAX_GLYPHS`）だけ、本体の `GlyphLayer` の下に `<Blur>` 付きの複製を置く。量は `pulse（拍頭からの指数減衰）× surge × (confidence < 0.5 なら 0.25)` で、半径は `8px × 量`（`GLOW_RADIUS_MAX_PX = 8`、設計書 §5 の 10px 以下）、不透明度は `0.9 × 量`。surge が 0 の通常区間では半径も不透明度も 0（弱い定常グローは置かない）。拍頭ごとの一過性の減衰のみで、常時光らない。複製は本体と同じ `glyphTransform` を評価するので入場・着地の途中でも文字から離れない。退場レイヤー・前後行・idle・reducedMotion では出さない。
- パレットの連続変化: `SongDirection.palette` に `accentHigh?: string` を追加（`src/direction/types.ts`）、`validateDirection` で「未指定可、指定なら #RRGGBB」を検証し、指定があれば結果に保つ。`DEFAULT_PALETTE` には `accentHigh: '#FF4D5E'`（既定の赤 `#D7263D` より明るく彩度の高い赤）を入れた（ルールベースとフィクスチャでも変化が見えるように）。補間は worklet で: `accent → accentHigh`（無ければ accent のまま）を surge で、`ink → accentHigh` を `surge × 0.15`（`INK_TINT_MAX`、`src/direction/surge.ts`）で。`LyricStage` が `inkNow` / `accentNow` を `useDerivedValue` で 1 回だけ導出し、全 `GlyphLayer` と caption とグローに渡す（`GlyphLayer` は `inkValue` / `accentValue` の任意 prop を受け、無ければ従来の固定文字列。surge が 0 のときは palette の文字列そのものを返すので既存の見た目と完全一致）。`TextureBackground` は `surge` prop を受け、`iInk` / `iAccent` uniform を同じ式（RGB の線形混合 `mixRgb`）で動かす。**`iBackground` は動かさない**（黒基調と平均輝度は不変）。現状 4 シェーダとも `iInk` / `iAccent` を読まないので、段階 5 の時点で背景の見た目は変わらない（段階 6 でシェーダ内部を触るときの受け皿）。色の変化が見えるのは文字（ink と accent）だけ。
- 設計書のアンチゴールの確認: 全面フラッシュは無い（グローは強調文字 ≤ 3 の局所的な一過性の減衰）。音量→大きさの直結は無い（surge は移動平均と分布からの「盛り上がり」で、大きさには結んでいない）。グローの輝度変化は surge 区間の拍頭に限られ、通常区間では 0。パレットの変化は 600ms / 1500ms の追従に乗せ、背景は不変。
- 判断（仕様の隙間への最小解釈、報告用）:
  1. 移動平均の窓は 8 小節（計画の 8〜16 の最短）。長くすると最初のサビに間に合わず、短くすると A メロ内の起伏を拾うため。実機所見で `PROFILE_WINDOW_BARS` を上げる余地を残した。
  2. 「上位 30%」の判定対象区間を分布に入れない（窓 1 本の遅延）のは計画に無い。最初のサビが自分自身で基準を押し上げて外れる問題への最小の手。
  3. 「曲の冒頭で誤検出しない」は「分布に 16 秒以上の履歴」で実装した。計画は秒数を定めていない。
  4. 歌詞側の `accent` 行は音響のガード（confidence・無音明け）を通さない。設計書 §4 のガードは「音響だけの判定」に掛かる文言で、グロー自体は量の式で confidence により 0.25 倍される。
  5. `accentHigh` を `DEFAULT_PALETTE` に入れた。設計書は「省略可」としており、省略時の挙動（accent 固定、ink だけ accent へ 15%）はテストで保証している。不要なら 1 行消せば戻る。
  6. 別 `trackId` でプロファイルを捨てる判断は、前の曲の分布を持ち越さないことを優先した。認識前に溜まった同じ曲の履歴（通常 10〜20 秒）は失うが、歌詞側の `accent` の OR で最初のサビは拾える見込み。
  7. グローの複製は `GlyphLayer` 内ではなく別レイヤーにした（既存の「グリフ群内の `skText` の枚数」を見るテストと、強調文字以外に描画命令を足さない方針のため）。
- 変更ファイル: 新規 `src/beat/energyProfile.ts`、`src/direction/surge.ts`、`src/typesetting/surgeColors.ts`、`src/typesetting/GlowLayer.tsx`。変更 `src/app/useStageSource.ts`、`src/direction/types.ts`、`src/direction/validateDirection.ts`、`src/direction/ruleBasedDirector.ts`、`src/typesetting/useBeatSharedValues.ts`（`surge`）、`src/typesetting/GlyphLayer.tsx`、`src/typesetting/LyricStage.tsx`、`src/textures/textureShader.ts`（`mixRgb`、`Rgb01`）、`src/textures/TextureBackground.tsx`。テスト: 新規 `src/beat/__tests__/energyProfile.test.ts`（+13）、`src/typesetting/__tests__/surgeColors.test.ts`（+6）。追加 `src/direction/__tests__/validateDirection.test.ts`（+3）、`src/direction/__tests__/ruleBasedDirector.test.ts`（+1）、`src/typesetting/__tests__/GlyphLayer.test.tsx`（+1、`surge` を束に追加）、`src/typesetting/__tests__/LyricStage.test.tsx`（+6、`surge` を束に追加）、`src/textures/__tests__/TextureBackground.test.tsx`（+4）、`src/app/__tests__/useStageSource.test.tsx`（+2）。Swift・ネイティブ・シェーダ本体（`grain.ts` 等）の変更はなし。
- 検証: **未検証**。本セッションの実行環境では `npm test -- --watchman=false` と `npm run typecheck` を実行できなかった。人が次を実行して結果を本ファイルに追記してほしい。

  ```bash
  npm test -- --watchman=false
  npm run typecheck
  ```

  落ちた場合に疑う箇所: (a) `energyProfile.test.ts` の数値は、0.3 の定常区間が 64 ビンの 19 番（上端 0.3125）に入ることと、100ms の間引きの位相（t=0 から 100ms ごと）を前提に手計算した。「窓の長さでの遅れ」で `early.strength` が 0 なら間引きの位相が 1 つずれている（`T + 200` の検査点を `T + 100` に）。`toBeCloseTo(1, 5)` が僅かに外れるなら p95 が 0.3125 より上に出て分母が 0.08 を超えている（`SURGE_MIN_SPREAD` の比較を `toBeGreaterThan(0.95)` に緩める）。(b) `LyricStage.test.tsx` のグローのテストは `skBlurImageFilter` というホスト要素名（Skia の `Blur` が `createElement("skBlurImageFilter")` する）に依存する。見つからなければ `queryAll` の条件を `n.type` の実際の値に合わせる。(c) 同テストの「ink と accent が動く」は、`useDerivedValue` がマウント時に同期評価される前提（段階 3 と同じ）。(d) `useStageSource.test.tsx` の surge テストはスケジューラの実タイマー（50ms）に依存するので、`waitFor` の後に `hear` を呼ぶ順を守る。値の閾値（> 0.9、< 0.1）は 600ms / 1500ms の時定数での手計算（0.997、0.018）。(e) typecheck で `Blur` の `blur` に `SharedValue<number>` を渡している箇所（`GlowLayer.tsx`）が落ちるなら、`AnimatedProp<Radius>` は `{ value: Radius }` なので `useDerivedValue<number | Vector>` に型を広げる。
- 実機で確認すること（段階 5 分）:
  1. サビ相当（反復行、または曲の中で音量の大きい区間）で強調文字が拍頭に光り、A メロに戻ると消えること。通常区間で光らないこと。
  2. グローの光り方が「点滅」に見えないこと（拍頭ごとの減衰で、1 回の振幅が文字 3 つ以内に収まる）。
  3. サビで文字の赤が明るく（`accentHigh`）、ink がわずかに暖かくなり、戻ること。背景の明るさが変わらないこと。
  4. グローを足しても fps 55 以上（Blur は強調文字だけ。太い行＋グローで描画が最も多くなるのでそこを測る）。10 分放置で発熱と焼き付きの懸念が増えないこと（ドリフトは無変更、背景不変、定常グローなし）。
  5. 音響だけの検出（`accent` 行の無い曲）が、曲開始から 30〜40 秒以降のサビで立ち、イントロや静かな曲で立たないこと。立つのが遅すぎる／早すぎるなら `PROFILE_WINDOW_BARS`（8）と `SURGE_MIN_HISTORY_MS`（16 秒）を調整する。
  6. 針を上げて戻したあと 8 秒はグローが出ないこと。
- 次にやること: 人による `npm test` / `npm run typecheck` の実行と結果の追記。通れば段階 5 の実機所見（グローと色の品）を見てから段階 6（テクスチャのクロスフェード。段階 5 で用意した `iInk` / `iAccent` の補間値をシェーダ内部で使う）へ。push はしていない（ローカル commit もこのセッションでは行っていない）。
- 検証結果（2026-11-08、呼び出し側で実行）: `npm test -- --watchman=false` は 44 スイート・395 件全通過。`npm run typecheck` は当初1件エラー（`TextureBackground.test.tsx` の `renderWith` ヘルパーが `accentHigh` 必須と推論され、未指定パレットを渡すテストと矛盾）→ ヘルパーの引数を `Palette` 型で注釈して解消し、再実行で通過。テストの意図（accentHigh 未指定時のフォールバック確認）は不変。

## 追記（2026-11-08）: ノリノリ化・段階 6（テクスチャのクロスフェード）の実装

ブランチ `feat/groove-stage6`（`feat/groove-stage5` の上に作成）。計画書の段階 6（最終段階）の 2 項目を実装した。テスト先行で進めた（シェーダ文字列の構造テストを先に書いてから本体を書き換え）が、本セッションの実行環境ではテスト・typecheck・git のコマンド実行が承認制約で行えなかった（下記「検証」を参照）。シェーダの実描画（SkSL のコンパイルと見た目）は jest の Skia モック（`jest/setupSkia.js` の `RuntimeEffect.Make` は常に成功を返す）では確かめられないので、すべて実機確認に回す。

- プレリュード（`src/textures/textureShader.ts`）: ブレンド用の共通関数 2 つを足した。`float energyBlend()` は `smoothstep(0.35, 0.85, clamp(iEnergy, 0, 1))` で、`iEnergy` が 0.35 以下なら 0（「穏やかな表情」そのまま）、0.85 以上なら 1（「賑やかな表情」）、間はなめらかに混ぜる。`float3 blendTextures(calm, lively, t)` は 2 つの表情の線形混合（`t` はクランプ）。範囲は TS の定数 `TEXTURE_BLEND_RANGE = { low: 0.35, high: 0.85 }` からテンプレートで埋め込み、同じ式の TS 版 `energyBlend(energy)` をテストと調整用に export した。uniform 宣言（`iResolution` 〜 `iAccent` の 12 個）と `dropDip`、`vignette`、`hash21` / `vnoise` / `fbm3` は無変更。
- 各シェーダの main を「穏やか（calm）」「賑やか（lively）」の 2 サブ関数に分け、`energyBlend()` で混ぜた。拍の持ち上げ（`iPulse * iConfidence * 0.06`）、`vignette`、`dropDip` の共通の尾は main に残した（混合のあとに掛かる順序は変えていない）。各表情は **同じ平均輝度** を持つように組んだ（線形混合なので、両端の平均が同じならクロスフェードの途中でも平均は動かない）:
  1. `grain`: calm は従来の 1 画素 1 ハッシュの粒。lively は粒が 24×1 px の横筋（セルごとに 1 ハッシュ）に 65% 寄った「走査線に寄りかけた粒」。どちらも `hash − 0.5` のゼロ平均ノイズを `iBackground` に足すので平均は不変。振幅（`0.04 + 0.06 * iHigh`）も同じ。ハッシュ 1〜2 回で軽いので両表情を常に評価。
  2. `paper`: calm は従来（fbm3 の繊維＋vnoise のムラ）。lively は「紙が張った」表情: 繊維の縦スケールを詰め（`mix(0.07, 0.055, iLow)`、従来は `mix(0.045, 0.03, iLow)`）、fbm3 の平均 0.4375（= 0.5·(0.5+0.25+0.125)、vnoise の平均 0.5 から）を中心に 1.6 倍のコントラスト、ムラはその平均 0.5 の定数に置き換え。平均の係数は両表情とも `0.95 + 0.4375·0.08 + 0.5·0.03 = 1.0` で一致。**評価は早期分岐**（下記「判断」1）。
  3. `scan`: calm は従来の 2 px 走査線。lively は線が 12×2 px のセルごとに 0.5〜1.5 の重みの「破線」になり、`iTime` で横に 8 px/s で這う（テープが走る感じ）。重みの平均は 1 なので線の平均の深さ＝平均輝度は不変。拍によるずれ（`scanDark`、1 パルスで 1 行）は両表情で共有。
  4. `void`: calm は従来の広い中心の持ち上げ。lively は持ち上げが半径 0.45 の小さな溜まりに集まり（面積が約 1/2.4 になる分、ピークを 2.4 倍: `0.048 + 0.12 * iLow * iConfidence`）、加えて画面全体がごく薄く傾く（`dot(uv − 0.5, (cos a, sin a)) × 0.03`、`a = iTime × 0.08`、1 周 約 80 秒）。傾きは画面上でゼロ平均。溜まりの平均は近似（smoothstep の形の差があるので厳密ではない。差は 0.01 未満の見積り）。
- 「点滅」の定義（アンチゴール、1 秒 2 回以上かつ振幅 20% 超）との照合: 新しい時間変化は scan の這い（セル境界が 1 画素を 1.5 秒に 1 回通過、段差は線の深さの最大半分＝背景の 6.5% 以下）と void の傾きの回転（周期 80 秒）だけ。grain の毎フレーム更新は従来どおり（粒の振幅は無変更）。クロスフェード自体は `iEnergy`（拍エンジンの 400ms 追従値）に乗るので「切り替わり」の瞬間は無い。
- 色の扱い: 段階 5 の補間の範囲のまま。4 シェーダとも引き続き `iBackground` だけから塗り、`iInk` / `iAccent` は読まない（下記「判断」3）。`iBackground` は不変で、どの表情も黒基調。
- 既存契約: uniform の宣言と `TextureBackground` 側の渡し方（`iDrop`、`iInk` / `iAccent` の補間を含む）は無変更。`TextureBackground.tsx` は触っていない。reducedMotion では `iTime = 0` なので scan の破線と void の傾きは静止する（クロスフェードは `iEnergy` に追従する。これは従来の `vignette` と同じ扱い）。
- 判断（計画・設計書の隙間への最小解釈、報告用）:
  1. **paper の評価方法は「早期分岐で片方だけ評価」にした**（計画の「割る場合は」の側）。当たり: 画面は 390×844 pt @3x ≒ 296 万画素。現状の paper は 1 画素あたり vnoise 4 回（= `hash21` 16 回）。lively は fbm3 だけで vnoise 3 回。両表情を常時評価すると 7 回（**1.75 倍**）で、paper が今ぎりぎり 55〜60 fps なら割る可能性が高いと見た。一方、分岐の条件 `t` は uniform だけから決まるので、全画素で同じ側を通り、GPU の分岐発散は起きない。よって `paperFaces()` で `t <= 0` なら calm のみ、`t >= 1` なら lively のみ、間だけ両方評価する形にした。静かな曲（`iEnergy ≤ 0.35`）は従来と同じコスト・同じ見た目、大音量（`≥ 0.85`）は従来の 0.75 倍、クロスフェード中だけ 1.75 倍。実機で fps が割れる場合の退避先は「判断」の末尾に書いた。grain / scan / void は 1 画素あたりハッシュ 0〜2 回なので分岐せず常に混ぜる。
  2. **クロスフェードの範囲 0.35〜0.85 は仮置き**。`iEnergy` は耳の RMS を dBFS −72〜−12 で 0..1 に線形化して平方根を取った値（`EarAnalyzer.swift`）を拍エンジンで 400ms 追従させたもので、再生中の音楽は 0.5〜0.9 あたりに来ると見積もった（実測はない）。計画の「静かな曲では従来と見分けがつかない」を下端 0.35 で担保し、上端は曲の山で lively に達する程度に置いた。実機で `TEXTURE_BLEND_RANGE` の 2 値だけを動かせば調整できる（シェーダ文字列はテンプレートで追従し、テストも定数から読む）。
  3. **背景には `iInk` / `iAccent` を使わなかった**。段階 5 の報告で「段階 6 の受け皿」と書いたが、計画の段階 6 は「色の扱いは段階 5 の補間の範囲に留め、背景の平均輝度は変えない」で、設計書 §6 も ink / accent の混合は「文字側」の話として読める（背景の黒基調と平均輝度の不変が優先）。背景に ink / accent を混ぜると平均輝度が上がる方向にしか動かせないため、今回は見送り、uniform の宣言だけ従来どおり残した。必要なら別途計画して足す。
  4. 各表情の「平均輝度が同じ」は式の上での担保（ゼロ平均ノイズ、平均を中心にしたコントラスト、重みの平均 1、ゼロ平均の傾き）で、void の溜まりだけ近似。単体テストでは式の構造しか見られないので、実機で輝度計（またはスクリーンショットの平均）での確認項目にした。
  5. 分析 7.3 の例「粒が走査線に変わる」は、質感の種類が変わったように見えない程度（grain の lively は粒 35%＋筋 65% の混合で、scan の線にはしない）に留めた。設計書 §6 の「4 種は維持」の趣旨。
  6. 退避先（実機で paper が fps 55 を割った場合）: (a) lively の fbm3 を 2 オクターブに落とす（平均は 0.375 に変わるので定数を直す）、(b) `TEXTURE_BLEND_RANGE` の幅を狭めて両方評価の時間を短くする（ただし変化が速くなる）、(c) lively を calm と同じ fbm3 サンプルの再整形だけにする（評価 1 回。繊維の太さは変えられなくなる）。順に試す。
- 変更ファイル: `src/textures/textureShader.ts`（`TEXTURE_BLEND_RANGE`、`energyBlend`、プレリュードに `energyBlend()` / `blendTextures()`）、`src/textures/grain.ts`、`src/textures/paper.ts`、`src/textures/scan.ts`、`src/textures/void.ts`（各 2 サブ関数＋main）。テスト: `src/textures/__tests__/TextureBackground.test.tsx`（+8: プレリュードのブレンド関数と範囲、TS 版 `energyBlend` の両端とクランプ、各シェーダに calm / lively があり main の前に宣言され `blendTextures` / `energyBlend` を通ること、各シェーダが使う `i〜` uniform がすべてプレリュードで宣言されていること（宣言と使用の整合）、`iEnergy` の読み取りがクランプ経由（＋void の従来の 1 箇所）だけであること、paper の早期分岐の構造と fbm3 / vnoise が分岐の外に無いこと、共通の尾（拍の持ち上げ→vignette→dropDip）が混合の後に残ること、`iEnergy` 0 / 1 を渡しても uniform がそのまま通ること）。`TextureBackground.tsx`、Swift、ネイティブ、計画書の変更はなし。
- 検証: **未検証**。本セッションの実行環境では `npm test -- --watchman=false` と `npm run typecheck` を実行できなかった。人が次を実行して結果を本ファイルに追記してほしい。

  ```bash
  npm test -- --watchman=false
  npm run typecheck
  ```

  落ちた場合に疑う箇所: (a) 「uniform の宣言と使用の整合」のテストは `//` 行コメントを剥がしてから `\bi[A-Z]\w*\b` を拾う。シェーダ本体のコメントに `iXxx` 風の語（宣言に無いもの）を書くと落ちるので、落ちたらその語をコメントから消す。(b) `toContain` を `Set` に対して使っている（jest は iterable を `Array.from` して探す）。型で弾かれるなら `[...declared]` に直す。(c) `matchAll` のスプレッドは `tsconfig` の `target`/`lib` が ES2020 以上である前提。落ちるなら `Array.from(...)` に。(d) 「`iEnergy` 0 / 1 を渡しても uniform がそのまま通る」は `useDerivedValue` がマウント時に同期評価される前提（段階 3・5 と同じ）。(e) 既存テスト「every texture gates its pulse response with iConfidence」は `iPulse * iConfidence` の文字列を各本体に求める。各 main の尾に残してあるので通るはず。
- 実機で確認すること（段階 6 分。シェーダの実描画は単体テストでは一切保証できない）:
  1. **4 シェーダがコンパイルされる**（起動時に `compileTextureEffect` が投げないこと。投げる場合は SkSL の文法: 関数の前方宣言順、`float3 paperFaces` の早期 `return`、`mod` / `smoothstep` / `dot` の型）。
  2. 曲のエネルギーの高低で質感がなめらかに変わり、「切り替わった」と分かる瞬間が無いこと。静かな曲・イントロでは従来と見分けがつかないこと（`iEnergy ≤ 0.35` で calm のみ）。達しない／常に lively なら `TEXTURE_BLEND_RANGE` を実測の `iEnergy` に合わせて動かす（`useBeatSharedValues.energy` をログに出せば読める）。
  3. 4 種すべてで fps 55 以上。**特に paper を、クロスフェードの最中（`iEnergy` が 0.35〜0.85 の間、両表情を評価している時間）で測る**。割れたら「判断」6 の退避先を順に。
  4. 背景の平均輝度が表情の両端で変わらないこと（同じ曲の静かな所と山でスクリーンショットを撮り、平均を比べる。void の溜まりは近似なので特に）。黒基調が保たれること。
  5. scan の破線の這い（8 px/s）と void の傾き（80 秒で 1 周）が「点滅」や「動いている背景」に見えないこと。気になるなら係数（`8.0`、`0.08`、`0.03`）を下げる。
  6. grain の lively（横筋）が「走査線に変わった」ではなく「粒が筋に寄った」程度に見えること。強すぎれば `mix(g, streak, 0.65)` の 0.65 を下げる。
  7. 10 分放置で発熱の懸念が増えないこと（paper は lively 側の方が軽い。クロスフェード中だけ重い）。焼き付きはドリフト無変更・背景の平均不変なので増えない見込み。
  8. 認識のドロップ（`iDrop`）と段階 5 の surge（文字の色）が従来どおり働くこと（uniform 契約は無変更だが、シェーダを書き換えたので回帰確認）。
- 次にやること: 人による `npm test` / `npm run typecheck` の実行と結果の追記。通れば EAS Development Build を更新し、段階 5・6 の実機所見（グローと色の品、テクスチャの変化と fps）をまとめて見る。これでノリ改善の第 2 階梯（段階 1〜6）は実装が揃うので、実機所見を受けた調整のあと、フェーズ 3（Claude API による演出ディレクター）の計画へ。push はしていない（ローカル commit もこのセッションでは行っていない）。
- 検証結果（2026-11-08、呼び出し側で実行）: `npm test -- --watchman=false` は 44 スイート・403 件全通過、`npm run typecheck` も通過。シェーダの実描画・コンパイル可否は単体テストでは保証できないため、次回ビルドの実機確認で担保する（進捗の実機確認項目参照）。

## 追記（2026-11-08）: フェーズ 2 最終レビュー修正

ブランチ `feat/final-review`（ノリノリ化の段階 6 `b342005` の上に作成）。最終レビュー下準備メモ（`~/workspace/projects/musicage-review/final-review-prep.md`）の裁定に沿って修正した。メモの照合時点が古く行番号がずれているため、各指摘は現行コードで再確認してから手を入れた（なお、本セッションの実行環境ではメモ本体の読み取りが権限で拒否されたため、依頼文に書き写された裁定を基準にした。メモ本文と食い違う点があれば指摘してほしい）。本セッションではテスト・typecheck・git の実行が承認制約で行えないため、検証は呼び出し側に委ねる（下記「検証」）。

### 判定と変更（指摘ごと）

| 指摘 | 判定 | 根拠と変更 |
| --- | --- | --- |
| J1 `useNativeEar` のエラー時にネイティブを止めない | **直した** | 現行コードでも `audio_setup_failed` / `interrupted` で `error` に入るだけで `stopListening` を呼んでいなかった。エラーハンドラと、`startListening` が reject した経路の両方で `stopNative()` を呼ぶようにした。`interrupted` はネイティブがエンジンを保持したまま（復帰を待つ）なので、JS の error 状態（再試行を促す）とネイティブの状態を揃える意味がある。テスト 3 件追加（両コードで `stopListening` が 1 回呼ばれ、retry で再停止しない／reject 時に呼ばれる／listening でないときは呼ばれない）。 |
| J6 `useEarRecognition` のエラーで LRCLIB を中断しない | **直した** | エラーハンドラで試行を終える直前に `attempt.controller.abort()` を呼ぶ。遅れて来た lookup の結果は `activeRef` の照合で捨てられる（既存の仕組み）。テスト 1 件追加（`resolving_lyrics` 中の `match_timeout` で signal が aborted になり、遅い成功が状態を変えない）。 |
| T2 曲替わり直後の 1 描画で旧曲の行インデックスが新曲に当たる | **直した（現行コードでも残っていた）** | 段階 1〜6 の変更後も、`schedule` は effect の `tick` が描画後に更新する state のままで、`timedLines` が変わった描画では旧曲の `schedule.line` が新曲の `lines` と組になっていた（`LyricStage` はその描画で新曲の行を旧インデックスで組版し、次の描画で退場させる）。`Schedule` に `lines`（スケジューラが走った行配列）を持たせ、現在の行配列と一致しない schedule は「無い」ものとして扱う（その 1 描画は idle。初回認識で schedule が無い間と同じ挙動）。`pastOutro` も同じ照合を通す。フィクスチャ開始・停止でも同じ経路で守られる。テスト 2 件追加（全描画の `source` を記録し、新曲の行配列と組になった描画のインデックスがすべて新曲のものであること／フィクスチャ開始でも同様）。副作用: 曲替わりの 1 描画が idle になるため、`LyricStage` のドロップは「その描画の idle 構成」を散らす対象として捉える（旧曲の行は通常の退場、idle グリフが拍頭で散り、新曲の最初の行が drop で着地）。これは idle → synced のドロップと同じ振り付けで、設計書 §7 の範囲内と判断した。実機で違和感があれば報告してほしい。 |
| O2 テスト追加 4 件 | **直した** | (a) `useStageSource.test.tsx`: 3 秒無音 → 200ms の物音 → 3.5 秒無音で行が残り、その後の無音が続いて初めて idle になる。(b) `RecognitionControls.test.tsx`: `resolving_lyrics` と `unavailable` の無効ボタンを press しても `onRecognize` / `onCancel` が呼ばれない。(c) `settingsStore.test.ts`: 読み書きとも `File(Paths.document, 'musicage-settings.json')` だけを開く。(d) `useSettings.test.tsx`: ロード前にアンマウントすると、遅れて解決したロードは `ready` を立てず、保存も走らず、`console.error` も出ない。 |
| S4 `EarAnalyzer` の `fatalError` | **直した（未コンパイル）** | `init?` にして `vDSP_create_fftsetup` が nil なら `return nil`（何も確保する前なのでリークなし。失敗した init では deinit は走らない）。モジュール側は `guard let analyzer = EarAnalyzer(...) else { throw EarSetupError.analyzerUnavailable }` で既存の catch → `audio_setup_failed` に乗せる。`nativeContract.test.ts` に「`fatalError(` を含まない／`init?(sampleRate: Double = 48_000)`／guard-throw の形」の照合を追加。 |
| S1 `setActive(true)` 後の guard throw でセッションが残る | **直した（未コンパイル）** | `sessionActive` フラグを足し、`activateAudioSession()`（`setActive(true)` と同時にフラグを立てる）／`deactivateAudioSession()`（フラグが立っているときだけ `setActive(false, .notifyOthersOnDeactivation)`）に集約。`stopListening()` はエンジンの有無で早期 return せず、最後に必ず `deactivateAudioSession()` を呼ぶ。これで `noInput` / `badFormat` / `analyzerUnavailable` の throw 経路（セッション有効・エンジン未保持）でもセッションが解除される。一方、一度も開始していない耳を止めても他アプリの音声には触れない（フラグが無いので no-op）。中断からの復帰（`handleInterruption`）と再開経路も同じヘルパーを通す。`nativeContract.test.ts` に「`setActive(true)` は 1 箇所でフラグと対／`stopListening` が無条件に解除する」の照合を追加。 |
| テクスチャ遅延初期化（旧 `fix/texture-shader-lazy-init` の `a41311c`） | **取り込んだ** | 意図をそのまま現行コードへ再適用: `compileTextureEffect(body)` は throw せず `Make` の結果（null 可）を返す。モジュールスコープの `TEXTURE_EFFECTS` を廃し `getTextureEffect(texture)` の遅延＋キャッシュ（失敗も含めて記憶）に変更。`TextureBackground` は `useMemo` で初回描画時に取得し、null ならパレットの背景色の単色 `<Fill color>` にフォールバック。段階 1/3/5/6 で増えた uniform（`iLow/iMid/iHigh/iConfidence`、`iDrop`、`iInk/iAccent` の補間、`energyBlend` / `blendTextures` のプレリュード）と `TextureBackground` の渡し方は無変更（uniform の derived value はそのまま。シェーダが無いときは Shader 要素を出さないだけ）。テスト: 新規 `textureShader.test.tsx`（Make が null のときに単色 Fill へフォールバックし Shader 要素が無い／`compileTextureEffect` がプレリュード＋本体で Make を呼び null を返す／`getTextureEffect` が null を返す／遅延コンパイルとキャッシュ／コンパイル成功時は Shader が出る）。既存 `TextureBackground.test.tsx` の「全テクスチャがコンパイルされる」は `getTextureEffect` ベースに更新。段階 6 の実機項目 1「起動時に `compileTextureEffect` が投げないこと」は、投げなくなったので「4 シェーダが単色フォールバックに落ちていないこと（質感が見えること）」に読み替える。 |
| O1 `expo-crypto` | **直した** | `src/`・`modules/`・`App.tsx`・`jest/`・設定ファイルに import が無いことを再確認したうえで `package.json` の依存から外した。**`package-lock.json` は触っていない**。ロックの同期は呼び出し側が `npm install`（または `npm uninstall expo-crypto`）で行い、生成された `package-lock.json` を同じコミットに含めてほしい。 |
| `.gitignore` | **直した** | `.env` を追加（現時点で `.env` ファイルは存在しない）。 |
| D1 設計書の「承認待ち」 | **直した（文書のみ）** | 冒頭の状態を「承認済み（フェーズ 1・2 を実装済み、改定履歴あり）」に改め、注記を付けた。 |
| D2 計画書 Task 0 Step 4 の `eas init` | **直した（文書のみ）** | 本文は履歴として残し、直前に superseded 注記（実行しない理由、Ruling 9 と `AGENTS.md` への参照）を置いた。 |
| D3 計画書 Task 1 の `eas.json` 例 | **直した（文書のみ）** | 例の `appVersionSource` を `remote` に直し、注記を付けた。 |
| D4 設計書の「EAS プロジェクトはまだ無い」 | **直した（文書のみ）** | 作成済み・引き継ぎ済み・`eas init` は実行しない旨の注記を付けた。 |
| Codemagic 移行の記録 | **直した（文書のみ）** | `2026-11-03-codemagic-testflight.md` に「移行完了（`ios-testflight` ワークフローで運用中、ビルド番号 5 まで配信済み）」の追記。 |
| J2 / J3 / J4 / J5 / J7 / T1 / T3 / S2 / S3 | **据え置き** | 裁定に無いため変更していない。上の「後回しにした指摘」のうち本追記で扱っていない項目（音声経路の変更・中断復帰の JS 通知、タップのスレッドの NSLock と割り当て、`useEar` の条件付きフック、`addErrorListener` の素通し、`clockConverter` の `?? 0`、試行 ID の無いネイティブイベント、同じ試行での 2 回目の認識、設定の初回読み込み前の `update`、起動直後の無音扱いの置き場、マイク停止中の進行）はこのまま残る。 |

### 変更ファイル

- JS/TS 本体: `src/audio/useNativeEar.ts`、`src/recognition/useEarRecognition.ts`、`src/app/useStageSource.ts`、`src/textures/textureShader.ts`、`src/textures/TextureBackground.tsx`
- テスト: `src/audio/__tests__/useNativeEar.test.tsx`、`src/recognition/__tests__/useEarRecognition.test.tsx`、`src/app/__tests__/useStageSource.test.tsx`、`src/components/__tests__/RecognitionControls.test.tsx`、`src/settings/__tests__/settingsStore.test.ts`、`src/settings/__tests__/useSettings.test.tsx`、`src/textures/__tests__/TextureBackground.test.tsx`、新規 `src/textures/__tests__/textureShader.test.tsx`、`modules/expo-musicage-ear/src/__tests__/nativeContract.test.ts`
- Swift: `modules/expo-musicage-ear/ios/EarAnalyzer.swift`、`modules/expo-musicage-ear/ios/ExpoMusicageEarModule.swift`
- 同梱: `package.json`（`expo-crypto` 削除。ロックは未同期）、`.gitignore`
- 文書: `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`、`docs/superpowers/plans/2026-10-19-lyric-typography-phase2.md`、`docs/superpowers/reports/2026-11-03-codemagic-testflight.md`、本ファイル

### 検証

**未検証**。呼び出し側で次を実行し、結果を本ファイルに追記してほしい（`npm install` はロックの同期のため先に）。

```bash
npm install
npm test -- --watchman=false
npm run typecheck
```

落ちた場合に疑う箇所: (a) `textureShader.test.tsx` の単色フォールバックは、Skia のモックが `<Fill color>` を `color` prop を持つホスト要素として出す前提。要素が見つからなければ `queryAll` の条件を実際の prop 名に合わせる（Shader 要素が無いことの確認だけでも意図は保てる）。同ファイルはモジュールのキャッシュに依存し、各テストが別のテクスチャ（paper / grain / void / scan）を初めて触る順で書いてある。順序を変えるときは `jest.isolateModules` に切り替える。(b) `useStageSource.test.tsx` の「物音で無音タイマーがやり直す」は、拍エンジンの無音ホールド 500ms を見込んで 3.5 秒＋1.5 秒の無音を流している。idle にならなければ最後の `emitFor` を 2 秒に延ばす。(c) `useNativeEar.test.tsx` の `test.each` は `as const` の配列で `code` の型を絞っている。(d) `settingsStore.test.ts` は `File` のモック（`jest.fn`）が `new` で呼ばれた引数を見る。(e) `useSettings.test.tsx` のアンマウントのテストは前のテストの `saveSettings` 呼び出しを `mockReset` で消してから数えている。

### 実機・ビルドで確認すること

1. **Swift 2 件（S4・S1）はビルドでしか確かめられない。** 次の Codemagic または EAS ビルドが通ること。通らなければ `EarAnalyzer.init?` の early `return nil`（Swift 5 以降は全プロパティ初期化前の `return nil` が可能）か、`activateAudioSession()` の `throws` 周りのエラーを見る。
2. S1: マイク開始に失敗した直後（例: 入力の無い状態を作れれば）に他アプリの音声が止まったままにならないこと。通常の開始 → 停止 → 他アプリの音が戻ること（`notifyOthersOnDeactivation`）。中断（通話）からの復帰後に停止しても同様。
3. J1: 通話などで `interrupted` が出たあと、「もう一度試してください」から再試行すると聴き取りが再開すること（ネイティブを止めてから再開するので、以前より一拍遅れる可能性がある）。
4. T2: 曲替わりの瞬間（再生中の別の曲を手動で読み取る）に、旧曲の行番号で新曲の行が 1 フレーム出ないこと。代わりに「旧曲の行が退場 → idle グリフが拍頭で散る → 新曲の最初の行が drop」の順に見えること。違和感があれば T2 の副作用の節を見直す。
5. テクスチャ遅延初期化: 起動して 4 種の質感がすべて見えること（単色の背景に落ちていれば、そのシェーダが実機で SkSL のコンパイルに失敗している。段階 6 の実機項目 1 を参照）。起動直後の 1 フレーム目が単色でないこと（初回描画で同期コンパイルするので変わらない見込み）。
6. 既存の実機項目（段階 1〜6、Device validation）に退行がないこと。
- 検証結果（2026-11-08、呼び出し側で実行）: `npm install` でロック同期後、`npm test -- --watchman=false` は 45 スイート・421 件全通過、`npm run typecheck` も通過。途中で2件の失敗を修正: (1) nativeContract の S1 検査が Swift の doc コメント内の文字列 `setActive(true)` にも一致して落ちたため、コメント側の言い回しを変更（実装の呼び出しは activateAudioSession 内の1箇所のみで不変）。(2) MusicageApp.test.tsx が1回だけ落ちたが再実行で通過（AGENTS.md 既知の単発フレークと判断）。Swift の実コンパイルは次回ビルドで確認する。
