# MUSICAGE 見た目の大改修 進捗（2026-11-09）

設計は `docs/superpowers/specs/2026-11-09-visual-overhaul-design.md`（コンセプト「灯下の一枚刷り」、Fable 著）。作業ブランチは `feat/visual-overhaul`（`master` の `c2e33bb` から）。各段階の終わりに `npm test -- --watchman=false` と `npm run typecheck` を相棒が実行し、結果をここに残す。

## ベースライン（着手前）

- typecheck 通過。
- テスト全体: 424 件中 423 件通過。`useBurnInDrift.test.tsx` の 1 件が 5000ms タイムアウトで落ちたが、単独再実行で通過（AGENTS.md 既知の「まれに 1 件落ちる」フレーク。Fable 実行と CPU を取り合っていたことも一因とみる）。

## 設計（コミット 84a6670）

- Fable が設計書（593 行）を作成。相棒の診断 6 点はすべて実コードで裏が取れた。主な追加発見: 背景の質感は 8bit で 1〜2 階調しかなく識別不能、今の画面で最大の輝度変化は全面の拍リフト（+15 階調）。
- 現行設計書へ 2026-11-09 改定の注記 3 点（palette.light、§6 の焦点 uniform と暗い基調の数値定義、§7 のクローム導出）を追記。
- 段階は A 色システム → B 面と灯 → C 墨の身体と焦点 → D オーナメント → E idle の刷り物化 → F クロームの統一 → G 実機所見の数値調整（G は実機所見後）。

## 段階 A: 色システム

- 新規 `src/direction/palettes.ts`（8 つの色の家族、辞書による決定的な選択 `paletteFamilyFor`、`lightHexFor`、`contrastRatio`、逆引き `paletteFamilyKeyFor`）と `src/direction/hash.ts`（fnv1a の切り出し。ruleBasedDirector と palettes の循環 import 回避）。
- `Palette.light?` を追加し、`validateDirection` で検証。
- `directSongByRules` は家族の palette / texture を返すようになった（DEFAULT 固定を廃止）。
- フィクスチャは kohaku（琥珀）家族に。PAL ピル（`fixture-palette`）で 8 家族を巡回できる。
- 検証: typecheck 通過。関連 7 スイート 105 件全通過（palettes / ruleBasedDirector / validateDirection / fixture 3 件 / useStageSource）。

### 実機で確認すること（段階 A）

- 3 曲で背景・文字・accent の色味が 3 通りに分かれる。
- PAL ピルで 8 家族を回し、文字が読めない家族が無い（特に sumi の赤、コントラスト比 約 3.9:1）。
- フィクスチャが琥珀色・質感 paper で見える。

## 段階 B: 面と灯

- プレリュード（`textureShader.ts`）に uniform `iFocus` / `iLight` / `iLamp` と `lampPool` / `lampStrength` / `surface` / `frame` / `beatLift` を追加し、旧 `vignette` と全面の拍リフト（`iPulse * iConfidence * 0.06`）を削除。定数は `SURFACE_CONSTANTS` からテンプレートで埋め込む。
- 4 シェーダを `surface × 素材 → beatLift → frame → dropDip` に書き換え。素材は乗算（float3 の灰色）で、calm / lively と `energyBlend` は維持。paper に簾の目（6px）、void は鋭い灯 `voidSurface`（`pow(pool, 1.6)`、base 0.09、`VOID_LAMP` in `void.ts`）。
- 新規 `surfaceModel.ts`（TS の双子と UI スレッドの追従関数 `lampTarget` / `followToward`）。
- `TextureBackground` に `focus` / `silence` props。1 つのフレームコールバック（`useCallback` で固定）で `iLamp`（τ 800ms）・`iFocus`（τ 600ms）・`iBackground` / `iLight`（τ 400ms）を追従。reducedMotion では iLamp 0.3 固定、焦点と色は即時。
- `useBeatSharedValues.silence`（1 = 無音、初期 1）を `useStageSource` が毎フレーム書く。`LyricStage` が `focusTarget` を持ち、主役の行の bounds 中心（uv）、無ければ (0.5, 0.42) を、値が変わるときだけ書く。

### 判断（段階 B）

1. **定数の変更（設計の初期値から）。** `LAMP_RADIUS` 0.75 → **1.0**、`LAMP_BASE` 0.07 → **0.08**、`LAMP_GAIN` 0.05 → **0.0375**。`FRAME_DARK` 0.45、`PULSE_LIFT` 0.02 は据え置き。理由: 半径 0.75 の灯は 9:19.5 の画面の約 23% しか覆わず（frame 込みの灯の平均重み ≈ 0.23）、中心 ≤ 42/255 を守る範囲（LAMP_BASE + LAMP_GAIN ≤ 約 0.126）では、灯が面平均に足せるのは 5 階調前後。地の寄与（地 × frame 平均 0.94 ≈ 11〜13）と足しても全家族が 16〜18 止まりで、18〜22 に入らない。LAMP_BASE / LAMP_GAIN だけでは不可能なので半径も動かした。半径 1.0 で灯の平均重み ≈ 0.36、見積りは面平均 18.6（midori）〜21.4（ai）、中心（iLamp=1）≤ 40、四隅 ≤ 8.4、拍リフト ≤ 4.84、中心での相対 ≤ 14.6%（iLamp=0 で判定）。目標値は変えていない。
2. **「8bit の値」の測り方。** テストは R・G・B の平均（ImageMagick `%[mean]` と同じ、設計 §5 D1）で判定する。拍リフトの最大だけは最も明るいチャンネルで判定（厳しい側）。
3. **void の帯域。** void の素材は「なし」（設計 §3b.2）なので iLow を読まなくなった。音への反応は灯の開き（iLamp）と拍リフトだけ。lively の傾きは乗算 ±0.03（中心から画面幅の半分で）。
4. **scan の平均。** 指定の式 `1 − dark·(0.18 + 0.12·iMid)` は半分の行が暗いので素材平均 0.85〜0.91。scan の画面平均は他の 3 種より約 1 割低くなる。段階 G で見る。
5. **lampPool の共有。** surface と beatLift がそれぞれ `lampPool(uv)` を呼ぶ（関数の形を設計に合わせた）。length 1 回 + smoothstep 1 回の重複で、コンパイラの共通部分式除去にも期待できる。

### 実機で確認すること（段階 B）

- スクショ 4 点（設計 §5 D1）: 灯の中心 30〜42、四隅 7〜12、全体平均 18〜22。テストの数値は手計算の見積りで、実機の測定はまだ。
- 4 質感がスクショで識別できる（紙の繊維と簾の目、粒、漆の艶、走査線）。
- 灯が主役の行に寄り、行の交代で約 0.6 秒かけて滑る。無音で灯が絞られる（約 0.8 秒）。
- 拍で灯の中だけがわずかに脈打ち、全面が光らない（160 BPM 以上の曲で）。
- PAL ピルで家族を変えると、背景色が約 1 秒で移る（瞬間の切り替えにならない）。
- fps 55 以上（paper のクロスフェード中を含む）。10 分放置で発熱が気にならない。

### 段階Bの検証（相棒、2026-11-09）

- typecheck 通過。関連11スイート258件全通過。
- 追従テスト1件が当初落ちたが、切り分けの結果プロダクトの不具合ではなかった。Reanimatedのjest用フレームレジストリは、fake timers下で2つ目のマウントに対してループを再開しない（1つ目のマウントでは灯・焦点とも設計どおり収束することを実測：iLamp 0.64997、iFocus y 0.69999）。対策として「on the frame loop」の2テストを1マウントのライフサイクルに統合した。
- SURFACE_CONSTANTSの初期値からの変更（LAMP_RADIUS 0.75→1.0、LAMP_BASE 0.07→0.08、LAMP_GAIN 0.05→0.0375）は、9:19.5の画面で平均18〜22と中心≤42を両立させるための再配分として妥当と判断し承認。根拠はtextureShader.tsのコメントとsurfaceModel.test.tsの目標テストに残っている。

## 段階 C: 墨の身体と焦点

- **墨の身体（§3c.1）。** `GlyphLayer` に任意の `body?: GlyphBody | null`（`{ ink, accent }`、どちらも `SharedValue<string[]>`）を追加。各グリフの `<Text>` の子に `LinearGradient`（start = `(x, y − 0.88·sizePx)`、end = `(x, y + 0.12·sizePx)`、グリフ座標）を置く。色は `LyricStage` が `inkNow` / `accentNow` の隣で 1 回ずつ `useDerivedValue` する（`surgeColors.ts` の `inkBody` = `[mix(inkNow, light, 0.12), mix(inkNow, background, 0.10)]`、`accentBody` = `[mix(accentNow, accentHigh, 0.3), accentNow]`）。`light` は `lightHexFor(palette)`、`accentHigh` は `surgeHighHex(palette)`。
- **接地影（§3c.2）。** 主役の行の `GlyphLayer` を `Group layer={<Paint><Shadow dx=0 dy=2 blur=3 color=rgba(background, 0.6)/></Paint>}` で包む（testID `line-shadow`）。前後行・退場中の行・caption・グロー・idle には付けていない。`rgbaOf(hex, alpha)` を `palettes.ts` に追加。
- **版面の共有。** `TOP_RESERVED` / `BOTTOM_RESERVED` / `CAPTION_GAP` を `idleComposition.ts` から `layout.ts` に移し、`printArea(viewport, captionAscent)`（left / right / top / bottom / captionBaseline）として公開。`composeIdle` はこれを使うように置き換えただけで、数値は同一（idle のテストは無変更）。
- **前後行（§3c.3 後半）。** 隅固定の `contextGlyphs` を `contextLine` に置き換え。gothic xs・横組みで、主役の行の `layout.bounds` 相対に置き、版面にクランプする。
  - 横組み: 前の行は bounds の上 28px（ブロックの下端 = bounds.y − 28）・右端を bounds の右端に揃える。次の行は bounds の下 28px・左端を bounds の左端に揃える。
  - 縦組み: 前の行は列ブロックの右（左端 = bounds 右端 + 28）で上端を列ブロックの上端に、次の行は列ブロックの左（右端 = bounds.x − 28）で下端を列ブロックの下端に揃える。どちらもその側の余白幅で折り返す。
  - クランプ: x は左余白を優先、y は下端（caption 行と操作列の上）を優先。右下の前後行が操作列の裏に入る既知の欠陥は、このクランプで起きなくなる（テスト「context lines stay inside the print area」）。
  - 見え方: 不透明度 0.35 → **0.5**、色 `contextInk` = `mix(inkNow, light, 0.3)`（平塗り、グラデーションなし）、accent の 10×2px の罫（前の行は最終行の末尾の右 6px、次の行は先頭行の頭の左 6px。罫の幅と隙間もブロック幅に含めて揃える）。xl の行では従来どおり出さない。

### 判断（段階 C）

1. **強調文字の色の移行をグラデーションでも保つ。** シェーダは塗りの RGB を置き換える（`color` は不透明度だけが効く）ので、共有グラデーションだけでは「強調文字が行の進みに沿って順に accent になる」移行が消える。強調で移行中のグリフだけ `MigratingBody`（2 色を ink の身体から accent の身体へ補間する `useDerivedValue`）をマウントする。普通の文字と、移行しない（行末不明の）強調文字は共有の配列をそのまま使う。グリフごとに導出するのは強調文字（1 行に数個）だけ。`color` の導出は従来どおり残している（不透明度と既存テストのため）。
2. **身体を付ける範囲。** 主役の行・退場中の行・idle（本体と差し替え文字）・drop で散る idle にはグラデーションを付けた（同じ文字が交代の瞬間に色味を変えないように）。前後行と caption（トレース中もそれ以降の静止テキストも）は平塗り。前後行は §3c.3 の「半影に沈む」色を優先した。
3. **太字の縁取りの双子にも同じグラデーション。** 塗りと縁で上下の明暗がずれないように。移行中の強調文字が太字の行にある場合は `MigratingBody` が 2 つマウントされる（同じ要素を 2 つの Text に渡すため）。
4. **`printArea` の引数。** 設計は `printArea(viewport)` だが、下の予約帯は caption 行の上端（caption の書体の ascent）で決まるので、`captionAscent` を 2 つ目の引数で受ける。idle と前後行はどちらも gothic xs なので同じ値になる。
5. **`layoutLine` は版面に移していない。** §3d の「`layoutLine` も版面を使う」は段階 D の範囲とし、主役の行の位置は変えていない。このため縦組みの主役の行は従来どおり `insetTop + 24` から始まり、ワードマーク行に掛かりうる。その右に置く前の行は版面の上端（`insetTop + 28 + 24`）にクランプされるので、列ブロックの上端より少し下がる。
6. **縦組みで横に入らないとき。** 側の余白が xs 2 文字 + 罫の分（約 51px）に満たないとき（xl の 2 列が左右余白に届く場合）は、横組みと同じ上・下の配置にしてクランプする。主役の列ブロックに重なりうるが、xl の行では前後行を出さないので、実際には l の 2 列などの限られた場合だけ。
7. **罫は前後行の Group の中。** 不透明度 0.5 は罫にも掛かる。

### 描画ノード・レイヤーへの影響

- `skText`（テストで数える対象）は変わらない。グラデーションは各 `skText` の子の `skLinearGradient`（シェーダ、描画命令ではない）として 1 つずつ入る。太字の行は塗りと縁の両方に 1 つずつ。
- 主役の行が出ている間だけ、オフスクリーンのレイヤーが 1 枚増える（`skLayer` > `skPaint` > `skDropShadowImageFilter` と `skGroup`）。グリフ単位の影は作っていない。退場中の行・idle にはレイヤーなし。
- 前後行ごとに `skRect`（罫）が 1 つ増える（最大 2）。これは新しい描画命令。
- UI スレッドの導出は、舞台全体で 3 つ増える（`inkBody`、`accentBody`、`contextInk`）に加え、移行中の強調文字ごとに 1 つ（太字の行は 2 つ）。毎フレームの React 再レンダーはない。

### 実機で確認すること（段階 C）

- 文字の上がわずかに明るく下が沈んで見え、メタリックに見えない（見えたら段階 G で 0.08 / 0.06 に）。暗い家族（sumi など）で読みにくくならない。
- 強調文字が行の進みに沿って順に accent に移り、移ったあと上端が accentHigh 寄りに明るい。
- 灯に照らされた面の上でだけ、主役の行の下に影が見える。黒地では見えない。交代の瞬間に退場する行が影なしで薄れ「浮く」。
- fps 55 以上（影のレイヤーとグラデーション込み。長い行・太字の行・paper のクロスフェード中）。割れたら §3c.2 の代替（ぼかしなしの双子）へ。
- 前後行: 横組みでは主役の行のすぐ上（右揃え）とすぐ下（左揃え）、縦組みでは列ブロックの右上と左下に出る。ワードマーク・操作列・caption 行と重ならない（特に右下が操作列の裏に入らないこと）。罫が accent で見え、前後行が 0.5 で半影に沈んで見える。
- 縦組みの主役の行の上端がワードマーク行に掛かっていないか（判断 5。段階 D で直す予定）。

### 段階Cの検証（相棒、2026-11-09）

- typecheck 通過。typesetting＋direction の10スイート205件全通過。
- §3cからの判断6点はいずれも妥当と判断し承認。特に判断1（強調の移行中グリフだけ専用グラデーション）は段階2の「強調の移り」を残すために必要。判断4（縦組み主役行の上端がワードマーク行に掛かる）は段階Dで layoutLine を printArea へ移す際に解消する申し送りとして記録。

## 段階 D: オーナメントと構図

- **刷られた印（§3d の表）。** `Ornaments.tsx` の 6 種を書き換え（語彙は増やしていない）。色は `LyricStage` の `inkNow` / `accentNow`（surge に追従する shared value）を `ink` / `accent` props で受け、行の `accent` を `accentLine` で受ける。
  - `rule`: 3px、両端を 12px 延長。accent 行は accent（不透明度 1）、他は ink 0.7。横組みは行の下 8px、縦組みは列ブロックの右 8px（従来どおり）。
  - `frame`: Group の不透明度 0.6 の中に、bounds の外 8px の 1.5px（`ornament-frame-inner`）と、さらに外 4px の 0.5px（`ornament-frame-outer`）。
  - `circle`: accent 0.7、1.5px、半径 0.6·h（判断 3 の上限つき）。
  - `grid`: ink 1px、不透明度 0.10。範囲は版面（従来はワードマーク行と操作列に掛かっていた）。
  - `numeral`: gothic s、accent、版面の右上（従来は `insetTop + 24` でワードマーク行に掛かっていた）。数字の下 4px に 24×2px の ink 罫（`ornament-numeral-rule`、右揃え）。
  - `none`: 変更なし。testID `ornament-*` は維持。
- **版面への統一（段階 C 判断 5 の申し送り）。** `layoutLine` に 5 つ目の引数 `area: PrintArea` を追加し、横組みの垂直センタリング・縦組みの上端・折り返し幅・列の中心・行頭をこの領域から取る。`LyricStage` は `printArea(viewport, gothic xs の ascent)` を 1 回 `useMemo` し、行ごとに `lineArea(area, direction, gothic s の metrics)`（版面からオーナメントの占める分を引いた領域）を作って、`layoutLine` と `contextLine` の両方に渡す。`contextLine` は内部で `printArea` を呼ばなくなった。`composeIdle` は従来どおり同じ `printArea` を使う（変更なし）。縦組みの主役の行は版面の上端（`insetTop + 28 + 24`）から始まり、ワードマーク行に掛からなくなった。
- **テスト。**
  - `layout.test.ts`: 全呼び出しに版面を渡し、数値を版面基準に更新（上端 83 → 111、使える高さ 703 → 約 517.6。縦 m の 1 列 22 → 16 文字、「1 段下げ」の例を 50 → 40 文字、xs の 200 文字は 5 → 7 列）。新規「版面の中に収まる、狭い領域では左端・中心・折り返しがその領域に従う」。
  - `GlyphLayer.test.tsx`: `layoutLine` に版面の引数を足しただけ。
  - `LyricStage.test.tsx`: 行のレイアウトをステージと同じ手順で作る `stageLayout`（版面 − オーナメントの分）を足し、焦点と前後行のテストの `layoutLine` 呼び出し 3 か所をこれに置き換え。「draws each line ornament」を §3d の 7 テストの describe に置き換え（rule / frame / circle / grid / numeral / none の太さ・色・不透明度・延長・二重罫、全オーナメント × 縦横で「主役の行・前後行とその罫・オーナメントがすべて版面の中」、idle のグリフも同じ版面の中）。

### 判断（段階 D）

1. **オーナメントの分を主役の行の領域から引く（§3d に無い仕組み）。** §3d は「両端 12px 延ばす」「bounds の外 8px + 4px」と「すべて版面に収める」を同時に求めるが、横組みの行は版面の左端から始まるので、そのままでは rule の左端と frame の左辺が版面の外（左余白）に出る。クランプすると frame の左辺が文字に接して崩れるので、代わりに `ornamentReach` が返す分（rule: 横組みは左右 12・下 9.5、縦組みは上下 12・右 9.5／frame: 四方 12.25／numeral: 数字と罫の高さ + 12 を上に）だけ領域を狭めて行を組む。結果として rule / frame の横組みの行は左端が 24 → 36px に、numeral の行は版面の上端から約 41px 下がる。前後行も同じ狭めた領域にクランプする（numeral と前の行が右上で重ならないように）。
2. **numeral の位置を版面の右上に。** 従来の `insetTop + 24` はワードマーク行の中。「版面の外に何も描かない」に合わせて版面の上端・右端に置いた。
3. **circle の半径に上限。** 「半径は変えない（0.6·h）」だが、縦組みの行は h が列の高さなので、従来から円が画面より大きくなり版面の外に出ていた。0.6·h を基本とし、版面の最も近い辺に接する半径（線幅の半分を引く）を上限にした。横組みの行では上限に掛からず、半径は従来どおり。縦組みの行ではほぼ常に上限（列ブロックの上下端に近い円）になる。実機で見て、縦組みに circle を出さない方が良ければ段階 G で決める。
4. **grid は線幅の半分だけ内側に。** 版面の外周の線が 0.5px はみ出さないように。
5. **numeral の罫の色と配置。** 「24×2px の ink 罫」の不透明度は指定が無いので 1（ink そのもの）。数字に合わせて右揃え、数字のディセントの下 4px。
6. **rule の ink 0.7 は図形の不透明度で。** 色は `inkNow`（surge に追従）、不透明度は Skia の paint の `opacity`。frame も同様に Group の 0.6。
7. **縦組みの 1 列が短くなる。** 版面は従来の「インセット + 24px」より上下に狭い（390×844・インセット 59/34 で 703 → 約 518px）。縦 m の 1 列は 22 → 16 文字になり、長い行は 1 段小さくなりやすい。§3d の規則どおりの帰結だが、見え方は実機で確かめる。

### 描画ノード・レイヤーへの影響

- frame は Rect 1 → 2、numeral は Rect（罫）が 1 増える。他は同数。レイヤー（offscreen）は増えない。
- オーナメントの色は既存の `inkNow` / `accentNow` を使うので、UI スレッドの導出は増えない。毎フレームの React 再レンダーはない。

### 実機で確認すること（段階 D）

- rule / numeral のある行で印が見える（rule は太く、両端がはみ出す。accent 行は特色）。frame が二重罫に見える。
- grid が灯の外で沈み、うるさくない。
- 縦組みの主役の行がワードマーク行に掛からない（段階 C 判断 5 の解消）。numeral・前後行・circle も含め、ワードマーク・操作列・caption 行に何も掛からない。
- 縦組みの 1 列が短くなった影響（判断 7）: 長い行が小さくなりすぎないか。
- 縦組みで circle が出た行の見え方（判断 3）。
- rule / frame の横組みの行が 12px 右に寄って見えるのが気にならないか（判断 1）。

### 段階Dの検証（相棒、2026-11-09）

- typecheck 通過。typesetting の7スイート155件全通過（版面に収まることの全組み合わせテスト含む）。
- 判断5点は妥当と判断し承認。特に判断1（オーナメントの張り出し分だけ行の領域を狭める）は「はみ出しの刷り物らしさ」と「版面の外に描かない」の両立として筋が通っている。
- 実機で見るべき副作用として記録：版面が上下に狭くなり、縦組み m の1列は22文字→16文字に減る。長い縦組み行が小さくなりすぎないかは実機所見で判断する。

## 段階 E: idle の刷り物化

構造化（PR #6）の規則（基線 4 本・列 3 本・段 3 つ・エポック・1 小節 1 文字の差し替え・無音凍結・回転なし）は変えず、書体・色・影・焦点だけを足した。`composeIdle` の位置・大きさ・文字・index の決め方は不変（既存の構造テストは無変更）。

- **`PlacedGlyph` の任意フィールド（`layout.ts`）。** `face?: 'primary' | 'secondary'`、`accent?: boolean`、`alpha?: number`（`phaseOffset` と同じ流儀で、idle だけが付ける）。
- **`composeIdle`（`idleComposition.ts`）。** 錨（xl）は `face: 'primary'`、相方（l / m）は `'secondary'`。エポックの accent の錨は `pick('accentRow', 4)` の行の錨。差し替え済みの最新の 1 文字（index ≥ 1000 のスロット）も `accent: true`（次の差し替えでそのスロットの印が外れ、新しいスロットに移る）。accent でない m 段は `alpha: 0.75`。
- **書体の決定 `idleFaces(direction)`（`idleComposition.ts`、純関数）。** 返り値は `{ primary, secondary, anchorWeight }`。
  - 未認識（`direction === null`）: `mincho-old` / `gothic` / regular（`UNRECOGNIZED_IDLE_FACES`）。
  - 認識済み: **数え方** = `direction.lines`（曲の全行の `LineDirection`。空行に当たるエントリも含む）の `font` を 1 行 1 票で数える。最多が主書体。**同数のときは、曲の中で先に（若い行番号で）現れた書体**を上にする（出現順の Map と安定ソート）。副書体はその次の書体（同じ規則）、1 種しか無ければ `gothic`。万一 3 種以上あっても上位 2 つだけを使うので、idle に出る書体は常に 2 つ以内。
  - 主書体が `gothic` なら錨は bold、他は regular。`direction.lines` が空なら未認識と同じ。
- **`GlyphLayer`。** グリフの `accent` が真なら、層の `accent` / 強調に関係なく accentNow（色）と accent の身体（グラデーション）で描く（移行なし、静的）。`alpha` は動きの不透明度に掛ける（`useDerivedValue` の依存に足しただけで、毎フレームの React 再レンダーはない）。
- **`LyricStage`。**
  - idle のグリフを face ごとに 2 つの `GlyphLayer`（主書体 / 副書体）に分け、差し替え文字の層は自分の face の書体で描く。3 層とも 1 つの `Group layer`（`Shadow` dy 2 / blur 3 / `rgba(background, 0.6)`、testID `idle-shadow`）で包む。caption と罫には掛けない。
  - 灯の中心: 主役の行が無いとき、accent の錨（`face === 'primary' && accent`）の中心（主書体の advance の半分、ascent と descent の中点）を uv で `focusTarget` に書く。錨が無い（書体の読み込み前）ときは従来どおり `IDLE_FOCUS` (0.5, 0.42)。書くのは値が変わるとき（エポックの交代、accent の錨そのものが差し替わったとき）だけ。
  - caption: 副書体 xs、ink 0.6（従来どおり）。上に accent（`accentNow`）の 12×2px の罫（testID `idle-caption-rule`）を、罫の下端が caption の字面の上端（ascent）から 6px 上になるよう、caption の左端に置く。位置は従来どおり。drop 直後の trace 中も副書体。
  - drop で散る idle グリフは、発火時点の書体（`Drop.idleFaces`）のまま散る（新しい曲の書体に一瞬切り替わらないように）。影は付けない（退場中の行と同じ）。

### 判断（段階 E）

1. **`composeIdle` に `faces` 引数を足していない（§3e の実装メモからの逸脱）。** §3e は `faces: { primary; secondary }` を 1 引数足すとするが、`composeIdle` が書体を使う場面は「基線と版面を測る」ことだけで、ここは版面（ステージと共有の `printArea`、gothic xs 基準）と同じ計量で測り続けたい（曲が認識されて書体が変わっても行が動かない。PR #6 の「caption 行は曲が無くても確保して、認識で行を動かさない」と同じ考え）。そのため `composeIdle` は face の役割（primary / secondary）だけを付け、役割 → `FontKey` の解決は `LyricStage` が `idleFaces()` で行う。副作用として、錨の基線は gothic の ascent で決まるので、主書体の ascent が gothic と大きく違う書体（brush、gothic-heavy）では錨の字面が版面の上端・下端からわずかにずれうる（数字・記号の字面は ascent より十分小さいので版面の外に出る見込みは低い）。実機で確認する。
2. **`alpha` フィールドを足した（§3e は `face` と `accent` の 2 つ）。** 「相方の m 段は ink 0.75」をグリフ単位で表すため。face ごとの層の中に m 段と l 段が混ざるので、層の不透明度では表せない。値（0.75）は `composeIdle` が持ち、`GlyphLayer` は掛けるだけ。
3. **accent をグリフ単位で `GlyphLayer` が解釈する。** §3e は `GlyphLayer` を触るファイルに挙げていないが、accent の錨と ink の相方が同じ face の層に入るため、層の `accent`（強調文字の移行）とは別に、グリフ単位の静的な accent を足した。差し替え文字が m 段のとき、accent なので 0.75 は掛けない（「他は ink。相方の m 段は ink 0.75」を ink の文字にだけ掛かると読んだ）。
4. **差し替え文字が accent の錨と同じスロットのとき**は accent の文字が 1 つだけになる（その小節は錨が差し替え文字を兼ねる）。それ以外は accent の文字は 2 つ（錨と差し替え文字）。小節 0（エポックの頭）は差し替えが無いので錨 1 つだけ。
5. **caption の罫の位置。** 「上に 12×2px」の隙間は前後行の罫（§3c.3、6px）に合わせて 6px、左端揃え。caption の上端と idle の行の間には版面の余白 24px があるので、罫はその中に収まる（テストで確認）。
6. **グラデーション（段階 C 判断 2）との整合。** idle の本体・差し替え文字は従来どおり身体のグラデーションを持つ。accent の文字は accent の身体（`[mix(accentNow, accentHigh, 0.3), accentNow]`）、ink の文字は ink の身体。m 段の 0.75 はグループの不透明度で掛かり、シェーダ（色の置き換え）と干渉しない。caption は従来どおり平塗り（ink、不透明度 0.6）。矛盾なし。
7. **idle の書体の切り替わり。** 認識（drop）の瞬間に idle の書体が新しい曲の主・副書体に変わる。散る側は旧書体のまま散り、新しい idle は散ったあと rise で出るので、同じ文字が書体だけ変わる瞬間は見えない見込み。

### 描画ノード・レイヤーへの影響

- `skText` の数は変わらない（idle 5〜9 文字、caption 1）。idle の層は 2 → 3（主 / 副 / 差し替え。React の層が 1 つ増えるだけで、描画命令は増えない）。
- オフスクリーンのレイヤーが idle 中に 1 枚増える（`idle-shadow`）。bounds は idle の 4 行 × 3 列なので版面のほぼ全体（§6.2 の見積りどおり全画面規模のオフスクリーン + ぼかし）。主役の行と idle は同時に出ないので、同時に存在する影のレイヤーは常に 1 枚。
- caption の罫 `Rect` が 1 つ増える（caption がある時だけ）。
- UI スレッドの導出は増えない（色は既存の `inkNow` / `accentNow` / 身体を使い、`alpha` は既存の不透明度の導出に掛けるだけ）。

### テスト（書いたもの。未実行）

- `idleComposition.test.ts`: 錨は primary・相方は secondary、エポックに accent の錨がちょうど 1 つでエポック内は同じ行、accent の行がエポックで変わる、差し替え文字は accent で accent は 1〜2 文字、m 段の ink は alpha 0.75（他は無し）。`idleFaces`: 未認識、最多、同数は先の行、1 種なら gothic、gothic 主書体は bold、空の lines、3 種でも 2 つまで。既存の構造テストは無変更。
- `GlyphLayer.test.tsx`: accent のグリフは accent の層でなくても accentNow と accent の身体、`alpha` が動きの不透明度に掛かる。
- `LyricStage.test.tsx`: 「idle の焦点は画面中心やや上」を「accent の錨の中心」に置き換え、エポックが変わると焦点が動く、書体の読み込み前は `IDLE_FOCUS`。「idle に影なし（段階 E で足す）」を「idle の全グリフを包む影が 1 つ、caption と罫は外」に置き換え。新規 describe「the idle print」: 未認識は mincho-old + gothic、認識済みは曲の主・副書体、gothic 主書体は錨が bold、すべて 2 書体以内、accent は錨と差し替え文字、caption は xs・0.6・12×2 の accent の罫（位置と版面の余白内）、曲が無ければ罫なし。書体の判定は `useStageTypefaces` と `createStageFont` を書体名つきのモックに差し替えて行う。
- 書いていないもの: drop で散る idle が旧書体のまま散ること（`Drop.idleFaces`）。

### 実機で確認すること（段階 E）

- 静かな部屋で idle が「刷り物」に見える（錨が明朝または曲の主書体、1 つが特色、相方は小さく副書体、m 段が少し沈む）。
- 灯が accent の錨に当たり、16 秒ごとに別の行へ滑る。それが「動いている背景」に見えない。錨が強すぎれば `TIERS` を落とす。
- 差し替わる文字が特色で現れ、次の差し替えまで特色のまま。特色が 2 文字になる小節がうるさくないか。
- caption の上の特色の罫が見え、caption 行・操作列と重ならない。
- idle の影: 灯の当たる面でだけ文字の下に影が見える。**fps 55 以上**（idle の影は全画面規模のオフスクリーン。§6.2）。割れたら idle だけ双子方式か影なしに退避。
- 主書体が brush / gothic-heavy の曲で、錨の字面が版面（ワードマーク行・caption 行）に掛からない（判断 1）。
- 曲の認識（drop）で idle が散るとき、書体が一瞬切り替わって見えない（判断 7）。

### 段階Eの検証（相棒、2026-11-09）

- typecheck 通過。typesetting の7スイート176件全通過（書き換えた2件＝「idleの灯は錨」「idleの影」含む）。
- 判断7点は妥当と判断し承認。判断1（composeIdle は寸法を gothic で測り続け、役割だけ付ける）は、認識の瞬間に行が動かないための措置として妥当。副作用（brush 主書体の曲で錨の字面がわずかにずれる可能性）は実機確認項目として記録済み。
- 「最も多い書体」の数え方（1行1票、同数は先出優先、副書体は2番目・1種のみなら gothic）は決定的で再現可能。承認。

## 段階 F: クロームの統一

前提: `expo-font ~57.0.4` は所有者が直接依存に追加済み（`package.json`、`app.json` の config plugin）。ネイティブモジュールなので Development Build は再ビルドが要る。

- **色（`src/theme/chrome.ts`、新規）。** `chromeTheme(palette, fonts?)` が §3f.2 の式どおり ink / inkMuted（ink→地 0.45）/ border（ink→地 0.65）/ accent / surface（地→ink 0.06）/ scrim（地 0.6）/ pressed（accent 0.18）を導出する。`mixHex` は段階 A の `palettes.ts` のものを使い、`withAlpha` は既存の `rgbaOf` の別名として置いた（同じ関数を 2 つ作らない）。`DEFAULT_CHROME_THEME`（`DEFAULT_PALETTE` 由来、フォント無し）と、書体の解決 `chromeFont(theme, 'regular' | 'bold')`（読み込み済みなら `fontFamily` だけ、未読込なら `fontWeight` 400 / 700 のシステム書体）も同じファイル。
- **書体（`src/theme/chromeFonts.ts`、新規）。** `useChromeFonts()` が `expo-font` の `useFonts` で `ZenKakuGothicNew-Regular` / `-Bold`（同梱済みの 2 ファイル。書体数は増えない）を読み込み、未読込・失敗時は `{}`、読み込み後は 2 つの名前を返す（`loaded` だけに依存する `useMemo` で、状態が変わるときだけ新しいオブジェクト）。`App.tsx` が呼び、`MusicageApp` に `chromeFonts` prop で渡す。待たない（スプラッシュで止めない）。
- **`MusicageApp`。** `stage.source.direction?.palette ?? DEFAULT_PALETTE` の background / ink / accent と `chromeFonts` を依存に `chromeTheme` を `useMemo` し、`RecognitionControls` / `ListeningControls` / `SettingsSheet` / `FixtureControl` に `theme` で渡す。ワードマークは gothic bold 12pt・字間 5・ink 0.85（位置・行の余白は不変）。状態は 6px の点（`StatusDot`）＋状態語 gothic regular 10pt・字間 2.5・inkMuted。点は idle が中抜き（1px の accent の輪）、listening が塗り、MATCHING / LYRICS が塗り＋外周 1px の輪（1px の隙間を空けた 10px の輪）。輪の箱は常に 10px なので、状態が変わっても状態語は動かない。アニメーションは無い。
- **`ChromeButton`（`src/components/ChromeButton.tsx`、新規）。** 最小高さ 48、角丸 14、枠 1px border（`primary` は accent）、地 scrim、押下で地 pressed、無効 0.4。文字 gothic bold 12pt・字間 1.5・ink 0.9。`RecognitionControls` の 2 つ（曲を読み取る＝primary、設定）、`ListeningControls` のマイク、`SettingsSheet` の閉じるをこれに置き換え、3 ファイルにあったボタンのスタイルの重複を消した。testID `recognize-button` / `settings-button` / `microphone-button` / `settings-close` を足した（既存の testID・アクセシビリティラベルは不変）。
- **文（エラー・案内）。** gothic regular 13pt・行送り 20・inkMuted・最大幅は現状（認識 300、マイク 280）。
- **`SettingsSheet`。** 幕 scrim、地 surface、上辺だけ 1px border、角丸 16。見出し gothic bold 15pt・字間 2・ink、ラベル gothic regular 14pt・ink、説明 gothic regular 12pt・inkMuted。`Switch` は `trackColor={{ true: accent, false: border }}`、`thumbColor={ink}`。
- **`FixtureControl`（開発のみ）。** 色だけ: 枠 border（再生中は inkMuted）、地 scrim、文字 inkMuted（再生中は ink）。書体はシステムのまま。
- 予約帯（ワードマーク行 28、操作列 130）、ボタンの高さ 48、操作列の gap 16 は変えていない。
- **独自色の除去の確認。** `src`・`App.tsx` を旧色（`#F4F0E6` `#A9AAA4` `#D8D0BA` `#171B1A` `#F7F2E5` `#C8C6B8` `#D8D4CA`、`rgba(17, 21, 20` `rgba(226, 219, 198` `rgba(169, 170, 164` `rgba(16, 17, 18` `rgba(244, 240, 230` `rgba(0, 0, 0, 0.5`）で grep して 0 件。クロームの 7 ファイル（`MusicageApp` / `ChromeButton` / `RecognitionControls` / `ListeningControls` / `SettingsSheet` / `FixtureControl` / `chrome.ts`）に `#RRGGBB` / `rgba(` の直書きは 0 件（`chrome.ts` のコメント 1 行だけ）。残る色の直書きは `transparent`（状態の輪の非表示）だけ。ルートの `backgroundColor: DEFAULT_PALETTE.background` は舞台の地で、クロームではないので据え置き。

### 判断（段階 F）

1. **フォントは `theme` に載せた（§3f.2 の `chromeTheme(palette)` から引数を 1 つ足した）。** `chromeTheme(palette, fonts = {})` が `fonts` を `ChromeTheme.fonts` に入れて返す。各部品は `theme` 1 つで色と書体を受け取れ、`useMemo` の依存（色 3 つと `chromeFonts`）で、パレットが変わるときとフォントの読み込みが終わるとき（起動時に 1 回）だけ作り直される。色の式は §3f.2 のまま。
2. **`useFonts` は `App.tsx` で呼び、`MusicageApp` に prop で渡す（§3f.1 のとおりルート）。** `MusicageApp` の中で呼ばないことで、`MusicageApp.test.tsx`（既存 521 行）が `expo-font` の非同期の読み込みに巻き込まれない。`jest-expo` は `ExpoFontLoader` のネイティブモジュールをモックしているが、`useFonts` のフックを直接使うテストは `chromeFonts.test.tsx` だけで、そこでは `expo-font` を `jest.mock` して `[loaded, error]` を返させている。`jest/` に共通のモックは足していない。
3. **useMemo の依存はパレットのオブジェクトではなく色の文字列。** `stage.source` は useStageSource の `useMemo` で作り直されることがあるため、オブジェクトの同一性に頼らず background / ink / accent の値で比べる（`accentHigh` / `light` はクロームで使わない）。
4. **MIC OFF / MIC ERROR / マイク準備中の点は中抜き（idle と同じ）。** §3f.3 は idle / listening / matching / lyrics の 4 つだけを決めている。耳が動いていない状態はすべて「休んでいる」側に寄せた。色は accent のまま（エラーで色を変えると状態語の他に意味を足すことになるので足さない）。
5. **ボタンは `minHeight: 48`（§3f.3 は「高さ 48」）。** 現状と同じ `minHeight` にして、文字サイズ設定で文字が大きくなったときに切れないようにした。通常の 12pt では 48 ちょうど。
6. **ボタンの文字の ink 0.9・ワードマークの ink 0.85 は `rgba` の色で掛けた（`opacity` ではない）。** 文字だけを薄くし、枠や地に影響させないため。
7. **シートの幕は scrim（地 0.6）。** 旧 `rgba(0, 0, 0, 0.5)` も独自色とみなして置き換えた（§3f.2 のコメント「モーダルの幕」どおり）。
8. **`ListeningControls` のマイクボタンも地 scrim になった。** 旧は地なし（枠だけ）だった。§3f.3 の「3 つのボタンのスタイル重複をこの部品に寄せる」に従い、全ボタン同じ地にした。
9. **FIX ピルの地は scrim（旧 0.35 → 0.6）。** 開発のみ・実機判定の対象外なので、新しい色を足さず theme の値をそのまま使った。

### テスト（書いたもの。未実行）

- 新規 `src/theme/__tests__/chrome.test.ts`: §3f.2 の式どおり（DEFAULT_PALETTE で値を固定）、既定テーマ、フォント名の受け渡し、8 家族で ink/surface ≥ 10:1・inkMuted/地 ≥ 4.5:1・border が地より明るく ink と inkMuted より暗い、`chromeFont` の未読込 / 読込済み。
- 新規 `src/theme/__tests__/chromeFonts.test.tsx`（`expo-font` をモック）: 2 書体を要求する、未読込は `{}`、読み込み後に 2 つの名前、失敗は `{}`、状態が同じなら同じオブジェクト。
- 新規 `src/components/__tests__/ChromeButton.test.tsx`: 高さ・角丸・枠・地・文字の色と大きさ、primary の枠は accent、無効は 0.4 で押せない、theme 省略で既定、読み込み済みは gothic bold。
- `RecognitionControls.test.tsx` / `ListeningControls.test.tsx` / `SettingsSheet.test.tsx`: theme から色が来る（主ボタンは accent、設定は border、文は inkMuted、シートの地・上辺・角丸・見出し・ラベル・説明、Switch の iOS ホスト props `onTintColor` / `tintColor` / `thumbTintColor`）、theme 省略で `DEFAULT_PALETTE` 由来・システム書体。既存のテストは無変更。
- `MusicageApp.test.tsx`（新規 describe「MusicageApp chrome (stage F)」）: 状態の点（idle 中抜き / listening 塗り / matching 輪つき）、ワードマークと状態語が既定パレットから、フィクスチャ開始でフィクスチャのパレットへ、PAL ピルで次の家族へ色が変わる、`chromeFonts` を渡すと gothic に差し替わる。

### 実機で確認すること（段階 F）

- **再ビルドが要る**（`expo-font` はネイティブモジュール）。古い Development Build のままでは `useFonts` がネイティブを見つけられない。
- 画面全体が 1 つの刷り物に見える（ワードマーク・状態・ボタン・設定が舞台の墨と特色で刷られている）。8 家族（PAL ピル）でボタンの枠・状態語が読める。
- 起動直後にシステム書体から ZenKakuGothicNew に差し替わる瞬間が気にならない（気になれば `SplashScreen` で待つ）。差し替えでワードマーク行・操作列の高さが変わって舞台が動かない。
- 状態の点: idle 中抜き / LISTENING 塗り / MATCHING・LYRICS 輪つき が 6px で見分けられ、点滅しない。
- 主ボタン（曲を読み取る）の accent の枠が強すぎない（sumi の赤で特に）。押下の色（accent 0.18）が見える。
- 設定シート: 地が緑がかった黒でなく、曲の地に近い色。Switch の on が accent、off の溝が border で見える（iOS の off の溝は `tintColor` が枠線にしか効かない場合がある。見えにくければ `ios_backgroundColor` を足す）。
- 曲が変わったとき（認識のドロップ）クロームの色が即時に切り替わり、ちらつきに見えない。

### 段階Fの検証（相棒、2026-11-09）

- typecheck 通過。app＋components＋theme の9スイート112件全通過（SettingsSheet の Switch props の確認含む）。
- 旧クローム独自色の grep 0件を報告で確認。判断6点は妥当と判断し承認（minHeight 48、MIC系の点は中抜き、など）。
- expo-font（~57.0.4）の依存追加と app.json の config plugin は相棒が実施し、このコミットに含めた。実機の書体反映には再ビルド（TestFlight）が必要。

## 全体検証（相棒、2026-11-09）

- 段階A〜Fの実装と検証が完了。コミット：84a6670（設計）/ 8c49e5e（A）/ 5245758（B）/ cbadcc7（C）/ 686f8b7（D）/ c13a8ae（E）/ 0444d43（F）。
- 全体テスト：50スイート632件全通過（着手前ベースライン424件から+208件）。typecheck 通過。
- 段階G（実機所見による数値調整）は未着手で、TestFlight配信後の本人の所見待ち。調整候補は設計書§3各所とGの節に列挙済み（グラデーション振幅、灯の定数、縦組み16文字/列の是非、idleの影のfps、主ボタンのaccent枠の強さ等）。

## 実機所見対応: 歌詞なしでも音楽に反応する舞台（2026-11-09、ブランチ `fix/no-lyrics-visual`）

所見: 曲は認識できたのに LRCLIB に同期歌詞が無い曲では舞台が idle のままで、曲名が caption に出るだけ。音楽が鳴っているのに「何も起きていない」ように見えた。あわせて LRCLIB の `/api/get` が表記ゆれで外れる場合の取りこぼしも直す。設計書 §7 に 2026-11-09 改定として「銘板」の項を足した（AGENTS.md の「変えるときは設計書を直してから」）。

### 判断

1. **3 つ目の舞台ソース `unsynced`（銘板）。** `LyricResult` が `plain` / `instrumental` / `lyrics_unavailable` で track が確定しているとき、`StageSource` は `{ kind: 'unsynced', track, direction, reason, dropAtMs }`。idle には落とさない。`not_recognized` と結果なしは従来どおり idle。`UnsyncedKind` と `isUnsyncedKind` は `src/recognition/types.ts`。
2. **銘板の組版（`src/typesetting/nameplate.ts`、純関数 `composeNameplate`）。** 版面の中を上から: 曲名の領域 → 24px → アーティストの accent 罫 12×2 と 6px 下にアーティスト行 → 20px → バンドメーターの高さ 36px（版面の下端に立つ）。caption 行に注記。
   - 曲名 = 主役の行として `layoutLine`（xl、idle の主書体 `faces.primary` とそのウェイト、`rise`、`hold: pulse`、オーナメント none）。かな・漢字を 1 字でも含めば縦組み（置物自身の書き方）、ラテンだけなら横組み。縦組みは領域の中で上下中央に寄せる。長い曲名は `layoutLine` の既存規則で 1 段ずつ下がる。接地影・墨の身体・灯の焦点は主役の行と同じ経路（`LineScene` を流用）。
   - アーティスト = s（版面幅に入らなければ xs）、副書体、平塗り（caption と同じ）、Group 不透明度 0.6、accent の 12×2 罫。曲名と同時に現れる（同じ着地で `fade`）。
   - 注記 = caption 行、gothic xs、ink 0.6。文言は `recognitionCopy.ts` の `unsyncedNote(kind)`: `lyrics_unavailable`「歌詞が見つかりませんでした」、`plain`「時刻つきの歌詞が見つかりませんでした」、`instrumental`「歌のない曲として登録されています」。「同期歌詞」というラベルは出さない（製品の決まり）。
3. **バンドメーター（`bandMeter.ts` + `BandMeter.tsx`）は刷られた目盛りで、光らない。** 24 本の 2px 罫、無音で 3px、全開で 36px × 罫ごとの形係数（0.72〜1 の決定的ハッシュ。平らなブロックにしない）。左端が低域、中央が中域、右端が高域で、その間は線形に混ぜる。色は `inkNow`（surge 追従の墨）、不透明度 0.7（rule オーナメントと同じ）。
   - 駆動は `beatValues.low / mid / high`（`useBeatSharedValues` が attack 20ms / release 150ms で平滑化済み）を、1 つの `useFrameCallback`（UI スレッド）で τ = 120ms（拍パルスの減衰と同じ）の一次追従、各罫は `useDerivedValue` で矩形を導出。**React の毎フレーム再レンダーは無い**。無音では包絡が 0 に落ちて基線の目盛りだけ残る。reducedMotion ではフレームコールバックを止めて基線に固定。
   - アンチゴール: 動くのは罫の高さだけで、全面の輝度は変えない。拍にも音量にも文字の大きさは直接追従させない（曲名の `pulse` は他の行と同じ規則）。語・音節の擬似同期は無い。
4. **ドロップは歌詞なしの曲でも発火する。** `useStageSource` の発火条件を `timedTrackId` から `namedTrackId`（結果のある track の trackId）に変えた。同じ trackId の再認識・再解決（plain → lyrics_unavailable など）では発火しない。`unsynced` ソースは drop の effect がその track を見た次のレンダーから出す（新しい state `confirmedTrackId`）。その前の 1 レンダーは track つきの idle で、舞台はそこから散る idle グリフを取る（同期曲の「最初の行は 1 レンダー後に乗る」と同じ形）。フィクスチャ再生中は銘板を出さない（最初の tick 待ちの間も idle）。
5. **`LyricStage` の行の識別を index から key に。** `LineScene.key`（`line:<index>` / `title:<artist>/<title>`）で drop の対象行と退場の判定を行う。銘板の曲名は index `TITLE_INDEX = -3`（seed 用）。銘板の開始時刻は `performance.now()`（舞台時計と同じ基準）を key が変わったときに取る。銘板 → idle（曲を見失った）では曲名が退場レイヤーに残り、`rise` の退場（320ms）で消える。アーティスト・メーター・注記は即時に消える（退場なし）。
6. **行が無くても曲の方向を作る。** `directSongByRules([], seed)` で家族（palette / texture）を決めるので、歌詞なしの曲でも地の色・クロームが曲ごとに変わる。行の direction が無いので idle の書体規則は未認識と同じ（`mincho-old` / `gothic`）になり、銘板もその書体。plain の本文を方向決めの材料に使うかは据え置き（後述）。
7. **LRCLIB フォールバック（`lrclibClient.ts`）。** `/api/get` が 404 なら `/api/search?track_name=&artist_name=`（アルバム名も長さも送らない。送るものは従来と同じ 2 つの名前だけ）。候補の選び方 `pickSearchCandidate`:
   - track に `durationMs` があれば、長さの差が **3 秒以内**で最寄りの 1 件。範囲内に無ければ null（同名の別録音に同期すると偽同期になる）。長さの無い候補は数えない。
   - 無ければ、正規化した曲名とアーティストが両方一致する候補。正規化 `normalizeName` = NFKC → 小文字 → 括弧の後置詞（`(Remastered)` など。全体が括弧なら残す）除去 → 空白・句読点・記号を除去。字種の翻字はしない。
   - 同点は synced > plain > instrumental > 検索順。歌詞も instrumental 印も無い候補は数えない。
   - ShazamKit の `SHMediaItem` は長さを返さないので、**今は名前一致の経路だけが動く**。`durationMs` は `NativeRecognitionEvent` → `EarRecognition` → `Track` に配線だけした（Swift は未送信、`Track.durationMs` は報告が無ければフィールド自体を付けない）。
   - 検索でも見つからなければ従来どおり `lyrics_unavailable`。エラーの意味（aborted / http / malformed / network / rate_limited）は `/api/get` と同じ。
8. **plain 歌詞（時刻なしテキスト）の本文表示は今回スコープ外。** 新しい銘板モードで受け（注記は「時刻つきの歌詞が見つかりませんでした」）、本文は出さない。出すなら設計書で「行を追わない」表示（例: 連・段落単位で拍に乗せずに流す）を決めてから。

### 特徴量ストリームの確認（認識完了後も舞台へ流れ続けるか）

コードで追った経路と結論: **止まる経路は無く、直すものは無い。**

- Swift（`ExpoMusicageEarModule.swift`）: `analysisMixer.installTap` のクロージャは、`matchSink.current()` が nil でも毎バッファ `analyzer.push` を呼び、`onFeatures` を送る。照合の終了 `endMatch()` は `matchSink` を nil にし `SHSession` を捨てるだけで、tap も engine も止めない。tap と engine を止めるのは `stopListening()`（マイク停止・OnDestroy）だけ。
- JS モジュール（`modules/expo-musicage-ear/src/index.ts`）: `addFeaturesListener` は `onFeatures` を常時購読。認識イベントとは独立。
- `useNativeEar`: `statusRef === 'listening'` の間だけ `emitter.emit`。status を変えるのは start / stop / `audio_setup_failed` / `interrupted` / AppState の非アクティブ化で、認識の完了・失敗・キャンセルは関係しない。
- `useEarRecognition`: マイクの状態に触れない。`cancel()` は `recognizer.cancelMatch()`（Swift では `endMatch`）だけ。
- `useStageSource`: 購読 effect の依存は `[beatValues, earStream, status]`。`result` が変わっても再購読・解除しない。`beatValues.write`（low / mid / high の包絡、pulse など）と `surge` / `silence` は毎フレーム書く。
- `LyricStage` → `BandMeter`: `beatValues.low / mid / high` を UI スレッドで直接読む。
- テスト: `useStageSource.test.tsx`「the band values keep flowing to the shared values while the nameplate is on stage」で、unsynced ソースのまま耳フレームが shared value に届くことを確認（書いたが未実行）。
- 実機で追加確認が要るのは、ShazamKit の照合中〜直後に `analyzer.push` の処理落ちが無いか（tap のスレッドで `matchStreamingBuffer` と FFT が同居する）。Swift は変えていない。

### 変更ファイル

- 変更: `modules/expo-musicage-ear/src/types.ts`（`durationMs`）、`modules/expo-musicage-ear/src/mapNative.ts`、`src/recognition/types.ts`（`durationMs`、`UnsyncedKind`、`isUnsyncedKind`）、`src/recognition/lrclibClient.ts`（search フォールバック）、`src/recognition/recognitionCopy.ts`（注記 3 種、`unsyncedNote`）、`src/app/useStageSource.ts`（`unsynced` ソース、`confirmedTrackId`、drop の条件）、`src/typesetting/LyricStage.tsx`（`unsynced` の描画、行の key 化）、`docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（§7 の改定）、本ファイル。
- 新規: `src/typesetting/nameplate.ts`、`src/typesetting/bandMeter.ts`、`src/typesetting/BandMeter.tsx`。
- テスト（書いたもの。**未実行**。実行は呼び出し側）: 新規 `src/typesetting/__tests__/bandMeter.test.ts`、`src/typesetting/__tests__/nameplate.test.ts`、`src/recognition/__tests__/recognitionCopy.test.ts`。更新 `src/app/__tests__/useStageSource.test.tsx`（「plain は idle」を「plain / instrumental / lyrics_unavailable は銘板、結果なしは idle」に置き換え、drop の発火・非発火、最初のレンダーが idle、フィクスチャ優先、特徴量の継続）、`src/typesetting/__tests__/LyricStage.test.tsx`（新 describe「the nameplate」: 曲名が影の下の主役の行、アーティスト、注記 3 種、メーター 24 本の位置・色・基線高さ、reducedMotion、版面内、灯の焦点、歌詞なしでも drop で idle が散り曲名が落ちる、銘板 → idle の退場）、`src/recognition/__tests__/lrclibClient.test.ts`（404 → search、URL の中身、候補選択の全規則、normalizeName）、`src/recognition/__tests__/types.test.ts`、`modules/expo-musicage-ear/src/__tests__/mapNative.test.ts`、`src/app/MusicageApp.test.tsx`（「plain は idle caption」を銘板と注記に置き換え）。
- 既存テストで仕様が変わったもの: `useStageSource.test.tsx`「a plain-lyrics result or no result is an idle source」と `MusicageApp.test.tsx`「passes a plain-lyrics result as an idle caption only」を新仕様に書き換えた。`lrclibClient.test.ts`「maps LRCLIB 404 to no record」は 404 が 2 回（get と search）になる前提に更新。実在の歌詞・曲名は使っていない。

### 描画ノード・レイヤーへの影響

- 銘板中: 主役の行（曲名）は同期曲と同じ（接地影のオフスクリーン 1 枚、グラデーション）。追加は `skRect` 24 本（メーター）+ 1 本（アーティストの罫）、アーティストの `skText`（平塗り）、注記の `skText` 1 つ。オフスクリーンは増えない。
- UI スレッドの導出: メーターのフレームコールバック 1 つ + 罫ごとの `useDerivedValue` 24 個（矩形）。毎フレームの React 再レンダーは無い。

### 実機で確認すること（歌詞なしの舞台）

- 同期歌詞の無い曲（インストゥルメンタルを含む）を認識させたとき、idle ではなく曲名が大きく出て、アーティストが小さく、足元のメーターが音に合わせて動く。注記が caption 行に 1 行で読める。
- メーターが「光っている」ように見えない（細い墨の罫の高さだけが動く）。ベースで左、ボーカル帯域で中央、シンバル・歯擦音で右が立つ。無音（針を上げる）で 1 秒以内に基線に落ちて止まる。
- 認識の瞬間に idle グリフが散って曲名が拍頭に落ちる（同期曲と同じドロップ）。同じ曲をもう一度読み取っても再発火しない。
- 曲名が縦組み（日本語）/ 横組み（英語）で版面に収まり、ワードマーク・操作列・caption 行に掛からない。長い曲名が小さくなりすぎないか。
- 曲が変わると地の色とクロームも変わる（行が無くても家族が決まる）。
- 歌詞ありの曲 → 歌詞なしの曲、歌詞なし → 歌詞あり、歌詞なし → 見失い（idle）で、交代が崩れない（曲名の退場、メーター・注記の消え方）。
- fps 55 以上（メーター 24 本 + 曲名の影の同時描画）。
- LRCLIB: 以前「歌詞なし」だった曲のうち、表記ゆれ（括弧の後置詞、全角）で外れていたものが検索フォールバックで同期歌詞に変わるか。逆に同名の別録音を拾って同期がずれる曲が無いか（長さが取れないので名前一致だけで選んでいる。ずれる例があれば `/api/search` の結果の `duration` と ShazamKit の照合位置から長さを推定する案を検討）。

### 据え置き・申し送り

- plain 歌詞の本文表示（判断 8）。
- 歌詞なしの曲の書体は未認識と同じ 2 書体（判断 6）。plain のテキストや曲名から書体・家族を選ぶかは、本文表示の設計と一緒に決める。
- `durationMs` の供給元が無い（ShazamKit は長さを返さない）。Apple Music のカタログ照会や検索結果の長さの推定は別件。
- 以上はすべて **未検証**（テスト・typecheck 未実行、実機未確認）。
- 検証結果（2026-11-09、呼び出し側で実行）: `npm test -- --watchman=false` は 53 スイート・690 件全通過、`npm run typecheck` も通過。
