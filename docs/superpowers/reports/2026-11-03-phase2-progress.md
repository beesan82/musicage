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
