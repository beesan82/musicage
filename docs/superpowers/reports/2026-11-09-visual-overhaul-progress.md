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

## 段階 H: idle 時計化（§3e 差し替え、2026-11-09）

### 経緯（所有者判断）

段階 A〜F の実機確認で、所有者が idle 画面（数字と記号のタイポグラフィ・ポスター。PR #6 + 段階 E）を「バグってるようにしか見えない。謎の UI」と却下した。意味のないダミー文字が浮いていることが根本の原因と判断し、**idle は時計にする**と所有者が決めた。視覚改修設計 §3e（idle の刷り物化）はこの範囲で差し替え。設計書 2 つに改定の注記を足した（`2026-10-18-lyric-typography-object-design.md` の「歌詞が無いとき」、`2026-11-09-visual-overhaul-design.md` §3e の冒頭）。

### 実装

- **`composeClock(now, viewport, track, measure, timeMeasure)`（`idleComposition.ts`、`composeIdle` を置き換え）。** `measure` は gothic（秒・日付・caption・版面）、`timeMeasure` は mincho-old（時刻）。戻り値は `IdleComposition`（glyphs + caption）に `focus?: { x, y }`（px、HH:MM の箱の中心）を足したもの。
  - 時刻行 `HH:MM`（24 時間、ゼロ詰め）: mincho-old、`face: 'primary'`、index 100〜104。
  - 秒 `:SS`: gothic、時刻の 0.32 倍、alpha 0.55、時刻と同じベースライン、時刻行の直後。`face: 'secondary'`、index 200〜202。
  - 大きさ: 「HH:MM:SS」の幅が版面幅の 94% になる大きさを、基準 100px での実測から比例で求め、`[CLOCK_MIN_PX 48, CLOCK_MAX_PX 168]` に収める。
  - 数字は**最も広い数字の幅のセル**に中央揃えで置く（手組みの等幅数字）。プロポーショナルな数字でも、数字が変わったとき隣が動かず、行全体が左右に揺れない。行の中央揃えもこのセル幅の合計で行うので、大きさ・位置は時刻によらず一定。
  - ベースライン: 版面の上から 38%。ただし時刻の字面の上端が版面の上端より上に出ないよう下げる。
  - 日付行 `M月D日（曜）`（曜日は漢字 1 字、括弧は全角）: gothic、`viewport.width × 0.066`（s = 0.06 よりやや大きめ）、alpha 0.75、自分の幅で水平中央。ベースラインは時刻のベースライン + 時刻の大きさ × 0.55 + 28px（版面の下端を超えるなら上げる）。**曜日の漢字だけ `accent: true`**。index 0〜（1 日の中では不変）。
  - caption は従来どおり `captionText(track)`（版面の左端、caption 行、xs。track が無ければ null。時計の位置は track の有無で変わらない）。
- **`LyricStage`。**
  - 時刻の state `clockNow`。`showIdle` の間だけ `useLayoutEffect` が秒の境目（+15ms の余裕）ごとに `setTimeout` を張り直し、**秒が実際に変わったときだけ** state を更新する（早く発火したタイマーは同じ Date を返すので React は再レンダーしない）。React の再レンダーは時計のために毎秒 1 回まで。layout effect なので、idle が出た最初のフレームから現在時刻になる。
  - `composeIdle(epoch, bar, …)` を `composeClock(clockNow, …)` に替え、idle の合成から bar / epoch への依存を外した。無音でも止まらない。
  - 書体: 時刻は `CLOCK_TIME_FACE`（mincho-old）、秒・日付・caption・caption の trace・散る idle は `CLOCK_TEXT_FACE`（gothic）で固定。曲の主・副書体（`idleFaces`）は銘板だけが使う（銘板のアーティスト用に `plateSecondary` を分けた）。
  - 灯の焦点: `idle.focus` があればそれ（uv に換算）、無ければ従来の「primary かつ accent のグリフ」の中心（時計では該当なし）、それも無ければ `IDLE_FOCUS`。時計の焦点は秒・分で動かないので、焦点の書き込みは idle に入ったとき（とビューポートの変化）だけ。
  - 影（`idle-shadow`、face 別 2 層を 1 枚の接地影で包む）、ドロップ時の散り（`idleExit`）、caption と 12×2 の罫、caption の trace、グラデーションの身体は従来どおり。

### 判断

1. **時計の滞留は `still`（ポスターは `breathe`）。** `breathe` はグリフごとに原点まわりで拡縮するので、数字の並びが互いにずれて揺れて見え、「バグに見える」所見を繰り返すおそれがある。壁時計は揺らさない。音への応答は灯・地・テクスチャ（拍・帯域・サビ）が受け持つ。
2. **登場の `rise` は idle に入るたび 1 回。** 時刻を `idleStartedAtRef`（`showIdle` が偽 → 真になったレンダーの `performance.now()`。初回は `nowMonotonicMs`）から上げる。ドロップ後は従来どおり `max(idle 開始, 散り終わり)`。毎秒の更新はこの値を変えず、グリフの key（index）も変わらないので、`AnimatedGlyph` は再マウントされず、動きの導出の依存も変わらない（entrance は再生されない）。
3. **毎秒の更新が entrance・ドリフトを壊さない方法。** (a) 時刻は `LyricStage` の中の state で、`nowMonotonicMs` や舞台時計 `time` の錨には触れない（錨の effect は `nowMonotonicMs` にだけ依存）。(b) idle の層の `lineStartedAtMs` は idle の開始時刻の ref で、毎秒変わらない。(c) グリフの index は行ごとの固定帯なので key が安定し、文字だけ差し替わる。(d) 主役の行・退場・ドロップの計算は `scene` / `scheduled` / `dropAtMs` にだけ依存し、時計の state を見ない。(e) 焼き付きドリフトは `MusicageApp` のドリフト View（舞台全体を包む）で、`LyricStage` の再レンダーと独立。
4. **秒の更新は `setInterval(1000)` ではなく秒の境目に合わせた `setTimeout`。** `setInterval` は位相がずれ、表示が最大 1 秒遅れたり秒が飛んだりする。
5. **大きさの下限 48px は「実測が壊れたとき」の保険。** 実フォントでは 390pt 幅で fit がおよそ 110〜125px の見込み（ZenOldMincho の数字幅を 0.5〜0.55em と仮定。この環境ではフォントの実測をしていない）。依頼の目安 120〜160px より小さく出る可能性がある。下限を 120 にすると、数字の広い書体・狭い画面で版面からはみ出すので、fit（版面幅の 94%）を優先した。実機で小さすぎれば `TIME_WIDTH` か秒の比率（0.32）を調整する。
6. **書体は時計と caption で 2 書体（mincho-old + gothic）に固定。** 曲が認識されていても idle 画面の書体は 2 つまで（caption を曲の副書体にすると 3 書体になる）。散る idle も同じ書体なので、`Drop.idleFaces` は不要になり外した。
7. **日付行の幅は日によって変わる（中央揃え）。** 1 日 1 回なので許容。秒・分では動かない。

### ポスター前提の仕組み: 外したもの・残したもの

- **外した**: `composeIdle` 本体、`COLUMNS` / `ROWS` / `TIERS` / `MIN_COMPANIONS` / `MAX_COMPANIONS` / `ZIGZAG` / `MIN_ROW_PITCH` / `MUTED_ALPHA`、`fnv1a`、`Cell`、`IDLE_EPOCH_BARS`（参照が `LyricStage` だけだった）。`LyricStage` の epoch / barInEpoch、bar と epoch の開始時刻の ref、差し替えグリフ（index ≥ 1000）の専用層 `idle-swap`、`Drop.idleFaces` と `idleFacesShownRef`、散る idle 用の書体ゲッター 2 つ、`DEFAULT_IDLE_GLYPHS` の import。
- **残した**: `IdleTrack`、`IdleComposition`（`focus` を追加）、`captionText`、`IdleFaces` / `idleFaces` / `UNRECOGNIZED_IDLE_FACES`（銘板とそのテストが使う）、`splitByFace`（face 別 2 層）、`idle-shadow`、`idleKey`（ドロップ後の再マウント）と `idleRiseAtMs`、`idleExit`（散り）、caption の trace、灯の accent 錨のフォールバック。`PlacedGlyph` の `face` / `accent` / `alpha` / `phaseOffset` フィールドと `GlyphLayer` の解釈（時計が `face` / `accent` / `alpha` を使う。`phaseOffset` は今は誰も付けないが、`motion` の入力として残した）。
- **触っていない**: director 側の `DEFAULT_IDLE_GLYPHS` と `SongDirection.idleGlyphs`（演出 JSON の契約・検証・フィクスチャ）。idle の描画では使わなくなった。

### 変更ファイル

- 変更: `src/typesetting/idleComposition.ts`、`src/typesetting/LyricStage.tsx`、`src/typesetting/layout.ts`（`PlacedGlyph` のコメントだけ）、`docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`、`docs/superpowers/specs/2026-11-09-visual-overhaul-design.md`、本ファイル。
- テスト（書いたもの。**未実行**）: `src/typesetting/__tests__/idleComposition.test.ts` を時計用に書き換え（固定の Date で: 文字列とゼロ詰め・24 時間・年末年始、index の帯、秒・分の変化でセルの中心・ベースライン・大きさ・焦点が不変、94% 幅と中央、上限・下限、ベースライン 38% と日付の間隔、日付の中央と大きさ、版面内、焦点 = HH:MM の中心、face / accent / alpha、caption。`idleFaces` のテストは無変更）。`src/typesetting/__tests__/LyricStage.test.tsx`（「空行・未スケジュールで idle」を時計の文字列で確認、「bar で組み替わる」を削除し新 describe「the idle clock keeps wall time」: 秒の境目で同じ key のまま数字だけ変わる・コロンは変わらない・bar と無音に依存しない・合成は 5 秒で 4〜5 回まで・行が出ている間は 0 回・entrance の起点が毎秒の更新で変わらない。焦点のテストを「HH:MM の中心」「時計が進んでも灯は動かない」に置き換え。「the idle print」を「the idle clock」にして、書体は曲によらず mincho-old + gothic、accent は曜日の 1 字だけ、に置き換え。影・caption・罫・ドロップの散りと trace のテストは無変更）。時刻は `jest.setSystemTime` で固定（日曜 2026-11-08 09:05:07.500、ローカル時刻）。

### 描画ノード・レイヤーへの影響

- idle の `skText` は 5〜9 → 16 前後（日付 7〜10 + 時刻 5 + 秒 3）。層は 3 → 2（差し替え層が無くなった）。オフスクリーンは従来どおり `idle-shadow` の 1 枚（範囲は時計の 2 行に縮む）。
- UI スレッドの導出は増えない（滞留が `still` になり、むしろ毎フレームの計算は軽くなる）。JS は毎秒 1 回の合成と再レンダー。

### 実機で確認すること（段階 H）

- idle が「時計」として一目で読める。時刻の大きさ（見込み 110〜125px）が足りるか、版面からはみ出さないか。ZenOldMincho の数字とコロンの見え方。
- 秒が毎秒変わるだけで、コロンや他の数字がちらつかない・揺れない。分が変わるとき時刻行が左右に動かない。
- 日付の曜日 1 字だけが特色で、うるさくない。日付の 0.75・秒の 0.55 が読める。
- 灯が時刻に当たって止まっている（秒で動かない）。無音でも時計は進み、灯だけが絞られる。
- 曲の認識（ドロップ）で時計が散って最初の行が落ちる。曲が終わって idle に戻ると時計が rise で出る。空行（間奏）のたびに時計が出入りして、うるさくないか。
- 長時間の常時表示で焼き付き回避のドリフトが従来どおり効いている。毎秒の再レンダーで fps が落ちない・電池の減りが目立たない。
- 日付が変わる瞬間（0:00）に日付行が正しく切り替わる。

### 統合検証（相棒、2026-11-09、段階H＋銘板）

- リモートの feat/visual-overhaul に別スレッドの銘板スナップショット（1b336df）が入ったため、ローカルで銘板（4d8dcc8）→段階H（4f1012d）の順に積み直して統合した。リモートの LyricStage.tsx は銘板コミットと blob 一致を確認済みで、今回の push は時計側の差分8ファイルのみ。
- 統合ツリー全体検証：テスト 686 件全通過、typecheck 通過。

## 改善サイクル（2026-11-09 夜、ブランチ `fix/nameplate-polish`）

所有者の指示「クロードを使って改善を回して」による 1 サイクル。土台は `feat/visual-overhaul` の先端 06d5044（大改修 A〜F＋銘板＋段階 H・時計）。実機所見はまだ無く、コードを読んでの堅牢化が中心。設計判断は設計書 §7 に「（2026-11-09 夜 改定）」として足した。

### 着手前の現状判定（コードを読んだ結果）

| 項目 | 判定 | 根拠 |
|---|---|---|
| 1a 長い曲名・アーティスト名 | **直す** | 曲名は `layoutLine` が xs まで下げ、xs では列（行）数に上限が無い。縦組みは左へ、横組みは上下へ版面からはみ出しうる（xs で約 160 字超、横組みは曲名の領域の高さを超えた時点で、アーティストと罫に重なる）。アーティストは s → xs の 1 段だけで、xs でも幅を超えれば右へはみ出す。字面の高さは先頭 1 字の計量だけで測っていた（かなとラテン混在で罫・メーターとの間隔がずれうる）。 |
| 1b メーターの輝度規律 | **直す（一部は満たしていた）** | 色（`inkNow`）と不透明度（0.7 の定数）は固定で、高さは `clamp01` で上限が効いていた。ただし帯域値が NaN だと `clamp01` が NaN を返し、追従器（`followToward`）が NaN に固着して罫が消える。±Infinity も追従器を壊す。フレーム落ち（長い dt）で一気に目標へ跳ぶ。1 フレームの変化量を時定数と結びつけて検証するテストが無かった。 |
| 1c 無音時の基線・曲名の静止 | **直す** | メーターは帯域の包絡だけを見ており、無音判定（`silence`）を見ていない。環境雑音で帯域値が残ると基線に落ちない。曲名の `pulse` 滞留は、拍パルスこそ減衰して 0 になるが、拍エンジンは無音中も拍の格子（`nextBeatAtMs` / `periodMs`）を保つため、予測拍頭の前の引き戻し（anticipation、最大 2%）が拍ごとに続き、「呼吸」が止まらなかった。 |
| 1d 遷移 | **直す（3 件）** | (i) 予定なしに去る行（曲の差し替え・見失い）の退場は `nowMonotonicMs`（最後の行替えの時刻。数秒前のことがある）から計っていたため、退場が描かれる前に終わっていた（銘板の曲名だけは `performance.now()` で正しかった）。(ii) 同期あり／銘板 → 新しい曲 では、結果の確定までの 1 レンダーだけ idle（時計）が出て、次のレンダーのドロップがそれを「散らす idle」として拍頭まで不透明度 1 で保持していた（曲と曲の間に時計が最大 1 秒ちらつく）。(iii) ドロップで入った曲名（行）が idle を挟んで同じ key で戻ると、再びドロップの対象になっていた。あわせて、銘板には無音で idle に譲る規則が無かった（同期歌詞の行は 4 秒で idle に落ちる）。 |
| 2 前後行と予約帯 | **既に満たしている（閉じる）** | 前後行は段階 C で `contextLine` が版面（`printArea`）にクランプするようになり、段階 D で主役の行と同じ `lineArea(printArea(...))` を受け取る。下端のクランプが上端より優先（`top = min(max(top, area.top), area.bottom − blockHeight)`）なので、何行に折り返しても caption 行と操作列の帯に入らない。idle の時計（`composeClock` → `printArea`）と銘板（`LyricStage` の `area` = `printArea`）も同じ関数・同じ定数（`TOP_RESERVED` / `BOTTOM_RESERVED` / `CAPTION_GAP`、`layout.ts`）を使う。既存テスト「context lines stay inside the print area」と §3d の全オーナメント × 縦横のテストが根拠。今回は回帰の歯止めとして、横組みの主役の行の下に何行にも折り返す次の行を置くテストを 1 件足しただけで、コードは変えていない。 |
| 3a 歌詞なしの再取得 | **直す** | `useEarRecognition` は「同じ trackId の timestamped」だけ LRCLIB を省いていた。歌詞なし・テキストのみ・インストゥルメンタルの曲は、自動再認識（音が戻るたびに発火）のたびに `/api/get` → 404 → `/api/search` の 2 リクエストを繰り返していた。同期ありの曲も、別の曲を挟んで戻ると再取得していた。 |
| 3b 長さの違う同名候補 | **検索は満たしていた／完全一致は直す** | `/api/search` の候補選び（`pickSearchCandidate`）は長さが分かれば 3 秒以内だけを数え、テスト済みだった。一方 `/api/get` の完全一致は長さを見ずに採っていたので、同じ名前・アルバムの別の長さの記録をそのまま使う経路が残っていた（今は ShazamKit が長さを返さないので実害は無いが、`durationMs` が配線済みのため）。 |

### 判断

1. **長い曲名は s で止めて「…」で切る。** 曲名は xl → l → m → s、2 列（2 行）まで（主役の行と同じ段の下げ方）。s で 2 列に入らない、または曲名の領域（版面の上端〜アーティストの罫の 24px 上）からはみ出すときは、入る最長の先頭（末尾の空白は落とす）に「…」を付ける（二分探索）。xs まで下げないのは、xs が caption・注記の大きさで、曲名が注記と同じ格になってしまうため。縦組み／横組みは切る前の曲名全体で決める（切った結果ラテンだけが残っても縦のまま）。縦組みの「…」は `ROTATED_IN_VERTICAL` で 90° 回るので縦の三点になる。`Nameplate.title.text` に実際に刷る文字列を持たせた（舞台の key は元の曲名のまま）。
2. **アーティストは 1 行、s → xs → 「…」。** 2 行にはしない（銘板の縦の帯の配分を変えないため）。字面の上下は行の全文字の計量の最小 ascent・最大 descent で取る。
3. **メーターの式を純関数に出した。** `meterTarget(band, silence)`（無音なら 0、非数は 0、+∞ は 1、他は 0..1 にクランプ）と `meterFollow(current, target, dt)`（τ 120ms の一次遅れ、dt は 0〜`METER_MAX_DT_MS` = 50ms に打ち切り、非数の現在値は 0 から）。`BandMeter` のフレームコールバックはこれを呼ぶだけ。1 フレーム（60fps）の最大移動量 `METER_FRAME_STEP_PX` = 33 × (1 − e^(−16.7/120)) ≈ 4.28px を定数として公開し、テストで τ と結びつけた。毎フレーム 0 と 1 を交互に入れる入力では、定常の揺れが約 2.3px（中央付近を漂う）。
4. **無音中は拍駆動の滞留を止める（主役の行すべて）。** `MotionInput.silent?`（任意。未設定は従来どおり）を足し、`GlyphLayer` と `GlowLayer` が `beat.silence.value >= 0.5` を渡す。`pulse`・`shake`・`breathe` は恒等に、`drift`（拍ではなく時間で動く）は対象外。同期歌詞の行にも効く（無音 4 秒で idle に落ちるまでの間、行が拍頭の前に縮み続けない）。`silence` は拍エンジンの 500ms の保持の後に立つので、無音に入って約 0.5 秒で静止する。引き戻しの最中（拍の最後の 15%）に立つと最大 2% の縮みが 1 フレームで戻る（無音の判定が拍頭の直前に重なったときだけ。気になれば段階 G で減衰を足す）。
5. **銘板は無音 4 秒で idle に譲る。** `useStageSource` に `roomQuiet`（無音が `SILENCE_REARM_MS` 続いた）を state で持たせ、耳の購読が端でだけ切り替える（毎フレームの再レンダーは無い）。銘板の条件に `!roomQuiet` を足した。音が戻れば同じ曲の銘板が `rise` で戻り、ドロップは再発火しない（`namedTrackId` は変わらない）。マイクを止めたときは `roomQuiet` を下ろす（同期歌詞の行と同じく、耳が無ければ無音の規則は働かない）。同期歌詞の行の無音規則（スケジューラの tick 内）には触れていない。
6. **退場は予定が無ければ「今」から。** `exiting.startedAtMs = scheduled?.startedAtMs ?? performance.now()`（曲名だけの特例をやめて一般化）。
7. **1 レンダーだけの idle は散らさない。** ドロップの発火時、直前の idle が「上がりきっている」（idle が他の表示の後に出た時刻、または前のドロップの `idleRiseAtMs` から `ENTRANCE_DURATION_MS.rise` = 420ms 以上たっている）ときだけ散らす。起動時から出ている idle は上がりきったものとみなす（`idleCameOnAtRef` の初期値 −∞）。上がりきる前の idle は散らさずに差し替える（実際には曲と曲の間の数 ms しか出ていない）。
8. **ドロップの対象は 1 回きり。** 舞台が対象の行・曲名から idle に移ったら `drop.lineKey` を `DROP_LINE_DONE` にする（従来は別の行に移ったときだけ）。
9. **LRCLIB の答えのキャッシュ（`src/recognition/lyricsCache.ts`）。** `trackId` → 記録 または null（無い）。`useEarRecognition` のフックごとに 1 つ（= アプリの起動中だけ）、メモリのみ、最大 64 曲（最も前に使ったものから忘れる）。取得失敗・中断は覚えない（次の認識で再取得し、`lyrics_failed` の再試行の意味を保つ）。ヒットしたら `resolveLyrics` を今回の照合の錨で回し、`resolving_lyrics` を経ずに idle の結果にする。空の trackId は覚えない。
10. **完全一致にも長さの規則。** 曲の長さが分かり、`/api/get` の記録の `duration` が 3 秒より離れていれば、検索に回す（検索は従来の規則で長さの近いものだけを採る。無ければ歌詞なし）。記録に長さが無ければ採る（反する情報が無い）。長さは比べるだけで送らない（製品の決まりの「LRCLIB に送るのは曲名・アーティスト・アルバム名だけ」を保つ）。

### 変更ファイル

- 変更: `src/typesetting/nameplate.ts`（曲名・アーティストの収め方、`NAMEPLATE_TITLE_MIN_SIZE` / `NAMEPLATE_ELLIPSIS`、`title.text` / `artist.text`）、`src/typesetting/bandMeter.ts`（`meterTarget` / `meterFollow` / `METER_MAX_DT_MS` / `METER_FRAME_STEP_PX`、`clamp01` の非数対策）、`src/typesetting/BandMeter.tsx`（無音で目標 0、`meterFollow`）、`src/typesetting/motion.ts`（`MotionInput.silent?`）、`src/typesetting/GlyphLayer.tsx`・`src/typesetting/GlowLayer.tsx`（`silent` を渡す）、`src/typesetting/LyricStage.tsx`（退場の開始、1 レンダーの idle を散らさない、ドロップ対象の 1 回きり）、`src/app/useStageSource.ts`（`roomQuiet`）、`src/recognition/useEarRecognition.ts`（キャッシュ）、`src/recognition/lrclibClient.ts`（完全一致の長さ照合、`knownDurationMs`）、`docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（改定履歴と §7）、本ファイル。
- 新規: `src/recognition/lyricsCache.ts`。
- テスト（書いたもの。**未実行**。実行は呼び出し側）:
  - 新規 `src/recognition/__tests__/lyricsCache.test.ts`（記録・null・未問い合わせの区別、上書き、上限と LRU、既定 64、空の trackId、インスタンスごとに独立）。
  - `src/typesetting/__tests__/nameplate.test.ts`: 新 describe「fitting a long title」（短い曲名は xl のまま、縦 34 字は s で全文、縦 60 字は 33 字＋「…」で s・2 列、横 120 字も同様、かな＋ラテン混在は縦で領域内、縦横それぞれ 1〜120 字の全長で s 以上・2 列以内・領域内・アーティストが右端を越えない、iPhone SE 相当の画面でも同じ）、アーティストの「…」切り（末尾の空白を残さない）、混在アーティストの最深 descent。既存「artist too wide drops to xs」は 40 字の例が新規則では切られるため、xs で収まる 16 字の例に差し替え、40 字の例は「切られる」テストに移した。
  - `src/typesetting/__tests__/bandMeter.test.ts`: 極端・非数の値でも基線〜上限、`meterTarget`（クランプ・無音で 0）、`meterFollow`（不透明度の上限、1 フレームの移動量 = `METER_FRAME_STEP_PX` で全行程の 15% 未満、ストロボ入力の揺れ 3px 未満、1 秒のフレーム落ちでも 50ms 分だけ、非数からの回復、無音で約 0.6 秒以内に基線 0.5px 以内）。
  - `src/typesetting/__tests__/motion.test.ts`: 新 describe「a silent room」（pulse の引き戻しも持ち上げも無い、1 拍のどこでも恒等、breathe・shake も恒等で drift は動く、false は従来どおり、登場・退場は影響なし）。
  - `src/typesetting/__tests__/LyricStage.test.tsx`: 新 describe「transitions: synced ⇄ nameplate ⇄ idle clock ⇄ lost」（予定なしの退場が「今」から、同期あり → 1 レンダーの idle → 別の曲の銘板で時計を散らさず曲名がドロップ、銘板 → 別の曲の同期行で曲名が退場し行がドロップ、ドロップ済みの銘板 → 無音の idle → 同じ銘板が rise で戻る、起動時からの時計は散る、行の後に出て上がりきった時計は散る、銘板 → 見失いで caption なし）、新 describe「silence on stage」（`silence` 1 で曲名の滞留に `silent: true`、音があれば false）、前後行の describe に「何行にも折り返す次の行が予約帯に入らない」。
  - `src/app/__tests__/useStageSource.test.tsx`: 銘板が無音 3.5 秒では残り、4 秒超で track つきの idle、音が戻ると同じ dropAtMs の銘板に戻る／マイクを止めても銘板は消えない。
  - `src/recognition/__tests__/useEarRecognition.test.tsx`: 新 describe「the session cache」（歌詞なしの曲を 3 回認識しても LRCLIB は 1 回、インストゥルメンタル・テキストのみも覚える、同期ありの曲が別の曲を挟んで戻ると記憶から錨を付け直す、失敗・中断は覚えない、新しいマウントでは再取得）。
  - `src/recognition/__tests__/lrclibClient.test.ts`: 完全一致の長さ照合（離れていれば検索、検索にも無ければ null、範囲内は検索しない、長さの無い記録は採る、長さ不明なら従来どおり、URL に duration を入れない）、検索で長さの離れた同名の同期記録より範囲内のテキストのみの記録を採る。
- 既存テストで前提が変わったもの: `nameplate.test.ts` の「artist too wide」（上記）。他の既存テストは変えていない（ドロップのテストは起動時からの idle なので散る判定は変わらない）。実在の歌詞・曲名は使っていない。

### 検証で落ちた 1 件の判定と修正（改善サイクル 2026-11-09 夜）

呼び出し側の実行で 740/741、typecheck 通過。落ちたのは `LyricStage.test.tsx` の「nameplate (dropped) → idle in a quiet room → the same nameplate again: it rises, the drop is not replayed」。同じ銘板へ戻した直後に `exit-idle-glyph-*` が 16 件（最初のドロップの時点の時計「23:48」と日付）残っていた。

- **判定: 本番コードの誤り（テストは正しい）。** 時間を進めれば消える「退場の途中」ではなく、ドロップの演出の再生だった。`dropAtMs` が 10_000 → null（無音の idle）→ 10_000 と戻ると、ドロップの演出を始める effect（依存は `dropAtMs`）が再び走る。`dropRef` は同じ fireAtMs なので計算し直されず、最初の発火時に捕まえた idle のグリフ（20 秒前の時計）で `setDropPlay({ idleExit, captionTracing: true })` をやり直していた。判断 8 で曲名のドロップ入場は 1 回きりにしたが、演出の側（散る idle・caption の描き込み）は 1 回きりになっていなかった。
- **実機での見え方:** 再生された散りは `lineStartedAtMs = drop.headMs`（約 20 秒前）から計るので、退場はとうに終わった扱いで不透明度 0 になり、目にはほぼ見えない。それでも古い時計の 16 グリフが 1 拍ほど描画ノードとして載り、タイマーも張り直される。また、無音の idle に移った時点で演出のタイマーが片付けられていれば（idle への移行が散りの最中なら）、`dropPlay` が残ったままになる経路もあった。状態として誤りなので本番側で直した。
- **修正（`src/typesetting/LyricStage.tsx`、ドロップの演出の effect）:** 演出を始める前に `drop.lineKey === DROP_LINE_DONE`（舞台が対象の行・曲名から一度離れた＝ドロップは済んだ）なら再生せず、その fireAtMs の `dropPlay` が残っていれば null にして終える。初回の発火では `lineKey` は null か対象の key なので従来どおり再生する（StrictMode の effect の二重実行でも、`lineKey` はレンダーで決まるので判定は変わらない）。
- **テスト:** 変更なし（アサーションも弱めていない）。設計書 §7 の「遷移」に「戻ったときはドロップの演出も再生しない」を 1 文足した。修正後のテストは**未実行**（実行は呼び出し側）。

### 描画ノード・レイヤーへの影響

- 描画ノード・オフスクリーンのレイヤーは増えない。UI スレッドの導出も増えない（メーターのフレームコールバックが `silence` を 1 つ多く読み、グリフの動きの導出が `silence` を 1 つ多く読むだけ）。
- React の再レンダーは、無音が 4 秒続いたとき・音が戻ったときに 1 回ずつ増えるだけ（`roomQuiet` の端）。

### 実機で確認すること（改善サイクル 2026-11-09 夜）

- 長い曲名（日本語 35 字以上、英語 30 字以上）の歌詞なしの曲で、曲名が s で 2 列（2 行）に収まり「…」で終わる。ワードマーク・アーティスト・メーター・操作列に掛からない。縦組みの「…」が縦の三点に見える。実フォントのラテン（プロポーショナル）で、横組みの切り方が不自然でないか（語の途中で切れる。気になれば語境界で切る規則を検討）。
- 長いアーティスト名が 1 行に収まり、xs でも入らなければ「…」で終わる。
- メーターがどの曲でも「光って」見えない。キックの立ち上がりで罫が跳ねず、約 0.1 秒で伸びる。アプリをバックグラウンドから戻した直後に罫が一気に伸びない。
- 針を上げると、約 0.5 秒で曲名の拍の縮みが止まり、約 1 秒でメーターが基線に落ち、約 4 秒で時計（曲名の caption つき）に替わる。針を戻すと銘板が下から上がって戻り、ドロップ（時計が散る演出）は起きない。自動再認識が走っても画面が変わらない。
- 同期歌詞の曲でも、無音に入ると行の拍の縮みが止まる（4 秒で時計に落ちるまでの間）。曲の途中の静かな箇所（ブレイク）で行が「止まって」見えることが気にならないか。
- 歌詞ありの曲 → 歌詞なしの曲（またはその逆）に替わるとき、前の行（曲名）が退場し、曲と曲の間に時計がちらつかない。新しい曲名・行が拍頭に落ちる。
- 曲が見失われたとき（認識なし）、前の行・曲名が一瞬で消えずに退場し、その下から時計が上がる。
- 歌詞なしの曲を何度か再認識させても、2 回目以降は歌詞の取得待ちの状態をほとんど経ずにすぐ戻る（LRCLIB に行かない）。機内モードで一度失敗した曲は、通信が戻った後の再認識で取り直せる。

### 据え置き・申し送り

- 横組みの曲名の切り方は文字単位（`layoutLine` の折り返しと同じ）。語境界で切る・折り返すかは実機の見え方で決める。
- 無音の判定が拍の引き戻しの途中で立つと、最大 2% の縮みが 1 フレームで戻る（判断 4）。
- クロームの予約帯の数値（`layout.ts` の `TOP_RESERVED` / `BOTTOM_RESERVED`）は `MusicageApp` のスタイルの数値（paddingTop 12、paddingBottom 18、ボタン 48、gap 16）の写しで、同じ定数を import しているわけではない。今回は項目 2 の範囲外として触れていない（ずれればテスト「a next line of many rows…」の `controlsTop` の式と合わせて直す）。
- 以上すべて **未検証**（テスト・typecheck 未実行、実機未確認）。
- 検証結果（改善サイクル、2026-11-09 夜、呼び出し側で実行）: 初回は LyricStage の遷移テスト1件が失敗（ドロップ演出の再生という本番バグと判定され LyricStage.tsx を修正、テストは不変）。修正後の再実行で `npm test -- --watchman=false` は 54 スイート・741 件全通過、`npm run typecheck` も通過。

## plain 歌詞の行を追わない表示（2026-11-10、ブランチ `fix/plain-lyrics-sheet`）

所有者の指示「次へ」。銘板の判断 8 で据え置いた「plain 歌詞（LRCLIB に時刻なしのテキストだけがある曲）の本文表示」に着手した。土台は `c758cae`（大改修＋銘板＋時計＋改善サイクル）。設計判断は先に設計書 §7 に「歌詞カード（2026-11-10 改定）」として書いた（改定履歴にも 1 項）。

### 判断

1. **表示の形は「歌詞カード」: 小さい見出し＋本文のページ＋メーター。** 依頼の推奨（本文を複数行のブロックとして静かに組み、長ければ拍と無関係な一定間隔でページ送り、現在行の強調なし）をそのまま採り、次の 3 点を足した。
   - **ノンブル（`2 / 3`）を caption 行の右に。** ページ送りが「曲の進み」ではなく「刷り物の何枚目か」であることを見せる。ページが 1 枚なら出さない。
   - **巡回する。** 最後のページの次は 1 ページ目。曲の終わりに向かって進むものではないことがはっきりする。
   - **間隔は固定（16 秒）で、本文の量・曲の長さ・テンポから計算しない。** 量に比例させると偶然曲の進みと揃い、同期しているように見えうるため。ページは 1.2 秒で消えてから次が 1.2 秒で現れる（重ねない）。
   採らなかった代案（設計書に理由つき）: 全文を 1 枚に縮める（読めない）、ゆっくりスクロール（流れる送りは同期に見えやすい）、量や長さで間隔を決める、拍頭で替える（禁止）。
2. **本文は音楽に一切反応させない。** 色は曲のパレットの `ink` の文字列そのもの（surge に追従する `inkNow` を使わない）、グリフごとの動き（`GlyphLayer` / `glyphTransform`）を通さず静的な Skia `Text`、接地影・墨の身体（グラデーション）なし、強調なし。動くのはページのグループの不透明度だけで、その導出（`PlainBody` の `useDerivedValue`）が読むのは舞台時計 `time` と固定のページ時刻だけ（`plainPageIndex` / `plainPageOpacity`）。ページ番号は JS のタイマーがページの境（不透明度 0 の瞬間）で切り替え、タイマーが遅れても旧ページは不透明度 0 のまま（時計が示すページと描いているページが違えば 0）。React の再レンダーはページ送りごとに 1 回。音楽に反応するのは従来どおり地・灯・質感とバンドメーター。
3. **見出しは小さく静か。** 曲名は主書体 s の 1 行（`still`。銘板の曲名のような `pulse` はしない）、アーティストは副書体 xs の 1 行（どちらも入らなければ「…」。銘板の `fitRow` を流用）、その下に accent の 12×2 の罫で本文と区切る。ここでの主役は本文なので、銘板の大きな曲名は使わない。
4. **組版の規則（`src/typesetting/plainSheet.ts`、純関数）。**
   - `plainParagraphs`: 改行で分け、各行を trim、行内の連続空白を 1 つに。空行（空白だけの行、全角空白を含む）は段落区切りで、何行続いても 1 つ。刷れる文字が無ければ空配列（→ 銘板のまま）。
   - 縦横は本文全体に `titleOrientation`（かな・漢字が 1 字でもあれば縦）。縦組みは右の列から左へ、字の置き方は `layoutLine` と同じ関数（`layout.ts` に `verticalOrigin` として切り出し、`layoutLine` もこれを使うように置き換え。挙動は不変）。
   - 本文は s・主書体 regular で全ページ同じ。行（列）送り sizePx × 1.7。
   - `wrapPlainLine`: 折り返した 2 行目以降は 1 字下げ。ラテン文字・数字の語は割らない（1 行より長い語だけ字で割る）。行頭禁則（、。，．」』）！？ー… など）は前の行の最後の語（字）を追い出す。
   - `paginatePlain`: 段落の間に 1 行（列）の空き。段落は丸ごと入るなら分けず、入らなければ次のページから。1 ページより長い段落は行の境、1 ページより長い 1 行は折り返しの境で分ける。ページの頭・末尾が空きになることはない。
5. **入り方: ドロップは見出しの曲名だけ。** 新しい曲の確定では時計が拍頭で散り、見出しの曲名が落ちる（銘板と同じ。曲の確定の表現であって本文の同期の主張ではない）。アーティストは曲名と同じ着地で `fade`。本文はドロップに加わらず、歌詞カードが出てから 1.5 秒後（壁時計。ドロップの最長待ち 1 秒＋散り 0.42 秒より長い）に 1 ページ目がフェードで現れる。
6. **遷移。** 見出しの曲名は主役の行（`LineScene`）として既存の経路に乗せた。key は `plain:<artist>/<title>` で、銘板（`title:…`）と別の舞台とした。同じ曲の再解決で plain ⇄ 歌詞なしが替わると、曲名は退場して相手の曲名が `rise` で入り、ドロップは再発火しない（`namedTrackId` 不変、ドロップの対象は 1 回きり）。本文は退場のとき、その時の不透明度から 0.4 秒（固定、拍で詰めない）で消える（`plain-page-leaving`）。アーティスト・罫・メーター・注記・ノンブルは銘板と同じく即時に消える。無音 4 秒で idle に譲り、音で戻る（曲名は `rise`、本文は 1 ページ目から同じ遅れで）。フィクスチャ優先・1 レンダーだけの idle を散らさない規則も銘板と共有（`useStageSource` の条件を 1 つの `if` にまとめた）。
7. **注記。** `RECOGNITION_COPY.lyrics_plain_sheet`「同期情報のない歌詞です」を追加（テスト id `plain-note`）。本文が空白だけの plain は従来どおり銘板で「時刻つきの歌詞が見つかりませんでした」。
8. **書体と演出。** plain の本文は `directSongByRules` の材料に使わない（行を追わない本文に行ごとの演出を当てない。パレット・質感は従来どおり曲の seed から）。書体は未認識と同じ mincho-old（曲名・本文）と gothic（アーティスト・注記・ノンブル）の 2 書体。
9. **灯** は本文の全ページを合わせた範囲の中心に置き、ページ送りで動かさない（見出しには寄せない）。
10. **reduced motion** では本文はフェードなしで出て、ページは境で差し替わり、退場のフェードも無い。

### 変更ファイル

- 変更: `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（改定履歴、§7 の銘板の項の改め、「歌詞カード」の項）、`src/app/useStageSource.ts`（`plain` ソース）、`src/typesetting/LyricStage.tsx`（`StageSource` の `plain`、歌詞カードの組版・描画・ページのタイマー・本文の退場・灯）、`src/typesetting/layout.ts`（`verticalOrigin` の切り出し）、`src/typesetting/nameplate.ts`（`rowGlyphs` / `rowWidth` / `fitRow` を export）、`src/recognition/recognitionCopy.ts`（`lyrics_plain_sheet`）、本ファイル。
- 新規: `src/typesetting/plainSheet.ts`、`src/typesetting/PlainBody.tsx`。
- テスト（書いたもの。**未実行**。実行は呼び出し側）:
  - 新規 `src/typesetting/__tests__/plainSheet.test.ts`: `plainParagraphs`（空行の連続・全角空白・CR/CRLF・空白だけ・1 行）、`wrapPlainLine`（1 字下げ、語を割らない、長い語、行頭禁則、1 トークンの行）、`paginatePlain`（段落の同居と空き、次ページへの送り、長い段落・長い 1 行の分割、折り返しの行をまたがせない、全容量で全行が順に 1 回ずつ・頭が空きでない）、`composePlainSheet`（null の条件、見出しの寸法と順序、長い曲名・アーティストの「…」、メーターと注記、横組みの行送りと左端、折り返しの字下げ、縦組みの列位置・空き列・回転、1 行で 1 ページ・ノンブルなし、縦横の長文で全ページが本文の領域と左右の余白内・ノンブルの文言と右揃え・注記と重ならない・全文字が 1 回ずつ、空行だらけ、本文の範囲、決定的）、ページ時刻（`plainPageIndex` / `plainPageOpacity` / `plainNextTurnInMs`）。
  - `src/typesetting/__tests__/LyricStage.test.tsx`: 新 describe「the lyric sheet」10 件（見出し・アーティスト・罫・本文・メーター・注記のスモーク、本文はパレットの ink の平塗りで影・グラデーション・グリフの動きなし（surge 1 でも）、本文の遅れと 1 ページの常駐、16 秒ごとの巡回とノンブル（拍の格子があっても）、灯が本文の中心でページ送りで動かない、ドロップは見出しだけで本文は拍頭で出ていない、歌詞カード → 銘板、歌詞カード → 無音の時計 → 同じ歌詞カード（ドロップ再生なし）、同期行 → 1 レンダーの時計 → 別の曲の歌詞カード、歌詞カード → 1 レンダーの時計 → 別の曲の同期行、reduced motion）。
  - `src/app/__tests__/useStageSource.test.tsx`: 新 describe「the lyric sheet」7 件（plain ソースの中身、結果の届いたレンダーは track つきの idle、plain ⇄ 歌詞なしでドロップ再発火なし、同期曲 → 別の曲の plain でドロップ、無音で idle に譲り音で戻る、フィクスチャ優先、surge の accent 行にならない）。
  - `src/app/MusicageApp.test.tsx`: 「plain は銘板」を「plain は歌詞カード（`plain-note` と `plain-page`）」に書き換え、「空白だけの plain は銘板」を追加。
  - `src/recognition/__tests__/recognitionCopy.test.ts`: 新しい注記の文言と、同期を主張しないこと。
- 既存テストで前提が変わったもの: `useStageSource.test.tsx` の銘板の describe で使う `plain` の結果を「刷れる文字の無い plain」（空白と全角空白だけ）に変えた（刷れる plain は歌詞カードになったため）。同じ describe の「別の歌詞なしの曲は自分のドロップ」の相手を plain から `lyrics_unavailable` に変えた。`MusicageApp.test.tsx` の「plain は銘板」は上記のとおり書き換え。`LyricStage.test.tsx` の銘板のテストは `unsynced` ソースを直接渡しているので無変更。テストの本文はすべてこのために書いた架空の文（または生成した「第0連の0行目です」の類）で、実在の歌詞・曲名は使っていない。

### 描画ノード・レイヤーへの影響

- 歌詞カード中: 見出しの曲名は主役の行と同じ（接地影のオフスクリーン 1 枚、グラデーション）。アーティストの `skText` 1 行分、罫 `skRect` 1、メーター `skRect` 24、注記・ノンブルの `skText` 各 1。本文は横組みなら 1 行 1 つ、縦組みなら 1 字 1 つの静的な `skText`（1 ページ最大で横 10 行・縦 9 列 × 16 字ほど）。本文には UI スレッドの導出がグループの不透明度 1 つだけ（グリフごとの導出は無い）。オフスクリーンは増えない。
- 退場中は本文の旧ページがもう 1 組（0.4 秒）。

### 実機で確認すること（plain 歌詞の歌詞カード）

- plain 歌詞しか無い曲を認識させると、時計が散って小さな曲名が落ち、約 1.5 秒後に本文が静かに現れる。本文が拍・音量で一切動かない・光らない・色が変わらない（地・灯・メーターは動く）。
- 「同期情報のない歌詞です」が caption 行に読め、ページが複数ならノンブルが右下に出る（注記と重ならない、操作列に掛からない）。
- 16 秒ごとのページ送り（1.2 秒で消えて 1.2 秒で現れる）が「曲に合わせている」ように見えないか。間が長すぎ・短すぎないか（実際に読み切れるか）。巡回が気にならないか。
- 縦組みの本文（日本語の歌詞）: 列の右から左への順、英単語の回転、句読点の位置、1 字下げ、行頭禁則が自然か。s（約 23pt）・行送り 1.7 が読める大きさか。横組み（英語の歌詞）で語が割れていないか。
- 長い歌詞・空行の多い歌詞・1 行だけの歌詞で崩れない。灯が本文の中央に当たり、ページ送りで動かない。
- 遷移: 時計 → 歌詞カード（ドロップ）、歌詞カード → 無音 4 秒で時計 → 音で歌詞カード（ドロップなし、1 ページ目から）、歌詞カード ⇄ 同期歌詞の曲、歌詞カード ⇄ 銘板（同じ曲の再解決）で、曲名の退場・本文のフェードアウトが崩れない。
- fps 55 以上（縦組みの本文 1 ページは静的な `skText` が百数十個。ページ送りの瞬間に引っかからないか）。

### 据え置き・申し送り

- 本文の大きさ（s）と行送り（1.7）、ページ間隔（16 秒）、本文の遅れ（1.5 秒）、フェード（1.2 秒）は実機の見え方で調整する（定数は `plainSheet.ts` の先頭）。
- 縦組みの判定は「かな・漢字が 1 字でもあれば縦」（曲名と同じ流儀）。英語の多い日本語の歌詞で縦が読みにくければ、比率による判定を検討する。
- 行頭禁則は小さな文字集合だけ（拗音・促音の小書きは対象外）。行末禁則（「『（ が行末に残る）は扱っていない。
- 横組みの本文は 1 行を 1 つの `Text` で描くので、実フォントのカーニングで測った幅（字ごとの advance の和）とわずかに違いうる（右端の余白 24px の内側に収まる範囲の差の見込み）。
- 以上すべて **未検証**（テスト・typecheck 未実行、実機未確認）。

### 歌詞カードのテストの書き直し（2026-11-10、同ブランチ）

呼び出し側の実行で 781/792。落ちた 11 件はすべて `src/typesetting/__tests__/LyricStage.test.tsx`（歌詞カード 9 件と、巻き添えの「silence on stage」2 件）。相棒の切り分け（根因 1: 1 テスト内の多重マウント、根因 2: fake timers を大きく進めたときの `registerFrameCallback` の TypeError、根因 3: `performance.now` の spy を手動で戻しているので、途中で落ちると戻らない）を出発点に、歌詞カードの describe を書き直した。**本番コードは変えていない。**

#### Reanimated の jest 実装を読んで分かったこと（テストの前提）

- **舞台時計 `time` はフレームでしか進まない。** `LyricStage` の `time` は `useFrameCallback` だけが書く（reducedMotion のときは anchor の effect が書く）。本文の不透明度（`PlainBody` の `useDerivedValue`）はこの時計で決まるので、rerender で `nowMonotonicMs` を進めても、フレームが回らなければ本文の不透明度は変わらない。旧テストがマウントし直して時刻を表していたのはこのため。
- **フレームのレジストリはテストをまたいで残り、前のテストのコールバックが「動作中」のまま残る。** RNTL の自動 cleanup（ルートの afterEach のうち先に登録されたもの。jest-circus は同じ階層の afterEach を宣言順に回す）は fake timers のうちにアンマウントするので、`unregisterFrameCallback` は fake の `setTimeout(0)` に積まれ、次の `jest.useRealTimers()` で捨てられる。`global._frameCallbackRegistry.activeFrameCallbacks` に前のテストの id が残る。レジストリは「動作中が 1 つになったとき」しかループを始めないので、タイマーを一度でも進めたテストより後のテストでは、フレームのループが二度と始まらない（段階 B の検証メモ「2 つ目のマウントでループを再開しない」と同じ現象）。
- **根因 2 の TypeError。** レジストリ本体（`global._frameCallbackRegistry`）は、`useFrameCallback.ts` の読み込み時に **実タイマー**の `setTimeout(0)` で用意される。jest-circus はマイクロタスクだけでテストを進めるので、単独実行（`-t`）ではこの実タイマーが一度も回らないうちに fake timers を進めることがあり、登録が未定義のレジストリに向かって落ちる。
- 派生値（`useDerivedValue`）は、入力の shared value が書かれると jest では同期に再計算される。依存（ページ送りで変わる `timing`）が変わったときの mapper の再起動は `setTimeout(0)` に積まれる。

#### やったこと（`src/typesetting/__tests__/LyricStage.test.tsx` の歌詞カードの describe だけ）

1. **1 マウント＋rerender に統一。** 各テストは舞台を 1 回だけマウントし、時刻の経過は fake timers を 1 秒刻みで進めて（`pass` / `passTo`）表す。`performance.now()` は describe の `beforeEach` で spy し、fake の `Date.now()` に追従させる（START = 10 000 から）。rerender するときの `nowMonotonicMs` はその時点の `performance.now()`。1 時間後の確認だけは、`performance.now()` を 1 時間跳ばして rerender する（アプリが長い休止のあと再描画するのと同じ形。舞台時計は新しい anchor に乗る）。
2. **`performance.now` の spy は describe の `afterEach` で必ず戻す**（ルートの `useRealTimers` より先に回る）。テストの途中で落ちても後ろの describe に漏れない（根因 3）。
3. **フレームのループを確実に回す。** describe の `beforeAll` で実タイマーを 1 回回して、レジストリの用意を済ませる（根因 2）。`beforeEach` で `global._frameCallbackRegistry` の `activeFrameCallbacks` を空にし、`nextCallId` を進め、`previousFrameTimestamp` を null にする（前のテストの残骸を外す）。これでこのテストの舞台のコールバックが最初の動作中になり、fake の requestAnimationFrame（16ms）でループが回る。後ろの describe の状態は従来と同じ（このテストの残骸も同じように残る）。
4. `pass` の最後に 0ms の flush を入れ、ページ送りで再起動した mapper が走ってから値を読む。
5. **アサーションは弱めていない。** 旧テストの主張はすべて残し、時計が実際に進むようになったので次を足した。
   - 本文の出現: シートの開始で 0、`PLAIN_BODY_DELAY_MS` の 100ms 前でも 0、フェードの途中は 0 と 1 の間、フェード後は 1。1 時間後も 1 ページのまま・ノンブルなし。
   - 16 秒のページ送り: ページの途中は 1、境の 200ms 前は同じページのまま薄れている途中、境の 200ms 後は次のページで現れている途中（ノンブル 2 / 3）、3 / 3 から 1 / 3 へ巡回。拍の格子（500ms）が信頼されていても境は 16 秒ごと。
   - ドロップ: 拍頭（START + 300）とその後の散り（START + 1000）でも本文は 0、シートの開始から遅れとフェードの後に 1（本文はドロップに加わらない）。
   - 本文の平塗り: surge 1・拍ごとのパルスの中でフレームを回したあとも、パレットの ink の平塗りで影・グラデーションなし、グリフの動きは見出しの 2 行（各 4 字、`still`）だけ。
   - 歌詞カード → 銘板: 本文の退場フェードが `PLAIN_EXIT_MS` の半ばで 0 と 1 の間。
   - 無音で時計 → 同じ歌詞カード: 本文が 1 ページ目から、同じ遅れ（戻った時刻 + `PLAIN_BODY_DELAY_MS`）で現れる。
   - 長いテスト（ページ巡回、灯、無音から戻る）は 50 秒前後の fake 時間でフレームを回すので、タイムアウトを 30 秒にした（段階 H の時計のテストと同じ）。
6. 「silence on stage」の 2 件は変更なし（巻き添えの原因だった spy の戻し漏れを 2. で塞いだ）。

#### 判断（相棒・所有者の確認がほしいもの）

- **テストが Reanimated の jest 用の内部状態（`global._frameCallbackRegistry`）を直接リセットしている。** 公開 API ではないので、Reanimated を上げたときに壊れうる（壊れたら `beforeEach` が「registry was not prepared」で止まるか、本文の不透明度のテストが 0 のまま落ちる）。代わりの案は (a) このファイル全体で `useFrameCallback` を jest.mock して、テストからフレームを明示的に進める（ファイル内の他の 100 件以上の前提が変わる）、(b) ルートの afterEach で RNTL の cleanup の後に fake timers を流す（全テストの後片付けが変わる）。今回は歌詞カードの describe の中に閉じる方を選んだ。ファイル全体の対策にするかは判断を仰ぐ。
- モック環境で担保できずに外した主張は無い。

#### 検証

- **未検証。** この環境ではエージェントのシェルからの `npm test` / `npm run typecheck` が承認待ちで止まるため実行していない（呼び出し側で実行が必要）。落ちたらまず疑うところ: (1) 本文の不透明度のテストが 0 のまま → フレームのループが回っていない（`beforeEach` のレジストリのリセットが効いていない）。(2) ページ送り直後の `toBeGreaterThan(0)` → mapper の再起動が読む前に走っていない（`pass` の最後の flush）。(3) 長いテストのタイムアウト。

#### 実機で確認すること（歌詞カード、今回の追記）

- 本文が拍・音量・surge で一切動かない（大きさ・位置・色・明るさ）。動くのは地・灯・質感・メーターだけ。
- 16 秒のページ送り（1.2 秒で消えて 1.2 秒で現れる）が曲に合わせているように見えない。拍頭やサビの頭と偶然重なっても「同期した」と感じないか。
- 縦組みの本文: 右から左への列の順、英単語の回転、句読点の位置、1 字下げ、行頭禁則、s（約 23pt）・行送り 1.7 の読みやすさ。
- ノンブル（`2 / 3`）と注記「同期情報のない歌詞です」が caption 行で重ならない。長い注記・狭い画面（iPhone SE 相当）でも重ならず、操作列に掛からない。
- 遷移: 時計 → 歌詞カード（ドロップ、本文は 1.5 秒後）、歌詞カード → 無音 4 秒で時計 → 音で歌詞カード（ドロップなし、1 ページ目から）、歌詞カード ⇄ 同期歌詞の曲、歌詞カード ⇄ 銘板で、曲名の退場・本文のフェードアウトが崩れない。
- fps 55 以上（縦組みの本文 1 ページは静的な `skText` が百数十個。ページ送りの瞬間・退場のフェード中に引っかからない）。

## 歌詞カードを全文一枚に（2026-11-11、ブランチ `fix/plain-sheet-full`、c04435d の上）

### 経緯（所有者指示）

所有者の実機所見と指示（そのまま）: 「同期情報のない歌やったら、せめて勝手に送らんと。全部を見えるようにしてよ」。これを受け、2026-11-10 版の固定 16 秒ページ送り（巡回・ノンブルつき）を廃止し、歌詞の全文を常に一枚の刷り物として全部見せる方式に作り替えた。2026-11-10 版で「全文を 1 枚に縮めて収める」を採らなかった判断（長い歌詞は読めない大きさになる）は、所有者指示により覆した。設計書 §7 の歌詞カードの項を改訂し（改定履歴 2026-11-11）、不採用の理由と覆した理由の両方を残した。

### 設計の変更（設計書 §7、2026-11-11 改定）

- 本文は全文を一度に描く。ページ・ページ送り・巡回・ノンブルは無い。本文は出現（シートが現れてから 1.5 秒後に 1.2 秒のフェード）と退場（0.4 秒のフェード）以外、時間で何も変わらない。本文の欠落（途中で切る・省く・描かない）と勝手な送りは禁止。
- **収納規則**（`plainSheet.ts` の `fitPlainBody`、純関数）。全文が入った最初のものを採る:
  1. 1 段のまま、文字サイズの段階 `PLAIN_SIZE_STEPS` を大きい順に: 0.06（= s）×行送り 1.7 → 0.053×1.65 → 0.047×1.6 → 0.041×1.55 → 0.036×1.5 → 0.032×1.45（下限）。
  2. 下限で段組み: 縦組みは段を上下に、横組みは左右に、2 段・3 段…（段の行・列の長さは 8 字以上 `PLAIN_MIN_TIER_EM`、段間 1.5 字 `PLAIN_TIER_GAP`）。段数ごとに、段落を段の境で割らない詰め方を先に、入らなければ段落の途中で段を替える流し込みを試す（`fillTiers`）。
  3. 最終手段: 下限の行送りのまま大きさを 0.9 倍ずつ下げ、各大きさで 1 段…最大段を試す。安全装置（60 回）に達しても全文をその大きさで組む（欠落なし）。
- 段落（空行）区切り・折り返し・1 字下げ・行頭禁則・縦横の判定は従来どおり。見出し・メーター・注記「同期情報のない歌詞です」も従来どおり。本文は音楽に一切反応しない（パレットの ink 一色、拍連動なし）。灯は本文全体の中心で、動かない。

### 判断

- **段組みは下限でだけ使う。** 所有者の指示の順（まず文字を段階的に下げ、それでも入らなければ段組み）に従った。大きい文字のまま段組みにすると 1 段の行が短くなり折り返しが増えて読みにくいので、下限に達してからにした。下限 0.032（390pt 幅で約 12.5pt）は仮置き。実機の距離で読めるかで調整する。
- **最終手段は「さらに小さく」。** 指示にあった例（下限で段数を最大まで増やす）は 2. で行い、それでも入らない極端に長い歌詞（数百行や、改行の無い数千字の 1 行）は欠落も送りも禁止なので、大きさを下げ続けるしかない。読めない大きさになりうるが、全文表示を仕様として優先した。
- **組みの計算は JS スレッドで 1 回だけ**（テキスト・画面・書体が変わったときの `useMemo`）。段階×段数の試行で折り返しを何度も計算するが、普通の歌詞（数十行）では軽い。数千字の 1 行のような端ケースでも 1 回の組みで済む。
- 2026-11-10 版の `paginatePlain` は `fillTiers`（段落を保つ／流し込むの 2 方式）に、`plainPageIndex` / `plainPageOpacity` / `plainNextTurnInMs` / `PLAIN_PAGE_MS` / `PLAIN_PAGE_FADE_MS` / `PLAIN_BODY_SIZE` / `PLAIN_LEADING` は `plainBodyOpacity` / `PLAIN_BODY_FADE_MS` / `PLAIN_SIZE_STEPS` に置き換えた。`PlainSheet` から `folios` と `body.pages` を外し、`body` に `runs`・`step`・`tiers`・`leading` を持たせた。
- 舞台の testID を `plain-page` / `plain-page-leaving` から `plain-body` / `plain-body-leaving` に改めた（`plain-folio` は廃止）。

### 変更ファイル

- `src/typesetting/plainSheet.ts`（収納規則 `fitPlainBody`、`fillTiers`、`plainBodyOpacity`、定数。ページ関連を削除）
- `src/typesetting/PlainBody.tsx`（ページ概念を捨て、全文の runs を 1 つのボディとして描く。不透明度は出現・退場のフェードだけ）
- `src/typesetting/LyricStage.tsx`（ページ送りのタイマー `plainPage` state・tick の layout effect・`PAGE_TICK_SLACK_MS`・ノンブル描画を撤去。出現の遅れと 0.4 秒の退場は維持）
- `src/typesetting/__tests__/plainSheet.test.ts`（ページ・ページ送りのテストを廃止し、`fillTiers`・`fitPlainBody`（段階・段組み・流し込み・最終手段・空行だらけ・1 行だけ・極端に長い 1 行・高さ 0 の領域）・`plainBodyOpacity` に置き換え）
- `src/typesetting/__tests__/LyricStage.test.tsx`（歌詞カードの describe: ページ送り・ノンブルのテストを廃止し、全ランの同時描画、長い歌詞でサイズ段階が下がること、時間が経っても何も変わらないこと、出現・退場、銘板 → 歌詞カードの遷移を追加。1 マウント＋rerender、`performance.now` の spy を describe の afterEach で戻す形は維持）
- `src/app/MusicageApp.test.tsx`（testID の改名に追従）
- `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（改定履歴、§7 歌詞カード）
- `docs/superpowers/reports/2026-11-09-visual-overhaul-progress.md`（この節）

### 描画ノード・レイヤーへの影響

- 本文の `skText` の数が「1 ページ分」から「全文」になった。縦組みは 1 字 1 ノードなので、60 行 × 12 字の歌詞で 700 前後。どれも静的（動くのは `Group` の不透明度だけ）だが、実機の fps を要確認。重ければ、本文を 1 回だけ `Picture`（記録した描画）にまとめる案がある（今回は入れていない）。
- ページ送りによる React の再レンダー（16 秒ごと）は無くなった。

### 実機で確認すること（歌詞カード 全文一枚）

- plain 歌詞しか無い曲で、全文が一枚に全部見え、何秒待っても勝手に替わらない（ページ送り・ノンブルが出ない）。
- 普通の長さの日本語の歌詞（30〜60 行）でどの段階・段数になり、その大きさが置物の距離から読めるか。下限（約 12.5pt）と行送りが妥当か。段組み（上段・下段）の読む順が自然か、段間が狭すぎないか。
- 英語の歌詞（横組み）で、段組み（左段・右段）が自然か、語が割れていないか。
- 極端に長い歌詞（最終手段で下限より小さくなるもの）が、欠けずに全部出ているか。小ささが許容できるか。
- 空行の多い歌詞・1 行だけの歌詞で崩れない。本文が罫とメーターの間に収まり、左右の余白（24px）を越えない。
- 本文が拍・音量・surge で一切動かない・光らない・色が変わらない。灯が本文全体の中心に当たり、動かない。
- 遷移: 時計 → 歌詞カード（ドロップ、本文は 1.5 秒後に全文が現れる）、歌詞カード → 無音 4 秒で時計 → 音で歌詞カード、歌詞カード ⇄ 同期歌詞の曲、歌詞カード ⇄ 銘板で、曲名の退場・本文の 0.4 秒のフェードアウトが崩れない。
- fps 55 以上（全文の静的な `skText` が数百個。出現・退場のフェード中も）。

### 据え置き・申し送り

- サイズ段階・下限・行送り・段の下限（8 字）・段間（1.5 字）・縮小率（0.9）は実機の見え方で調整する（定数は `plainSheet.ts` の先頭）。
- 本文が少ないとき、本文は従来どおり領域の上（縦組みは右上）から組み、領域の中央には寄せない。余白の多い見え方が気になれば検討する。
- 横組みの本文は 1 行を 1 つの `Text` で描くので、実フォントのカーニングで測った幅とわずかに違いうる（2026-11-10 版から変わらず）。
- **未検証**: この環境ではエージェントのシェルからのテスト・typecheck を実行していない（呼び出し側で実行が必要）。実機も未確認。

## 時計の曜日・時計のメーター・歌詞の出方（2026-11-11 夕、ブランチ `feat/stage-patterns`、686e99d の上）

### A. 時計の日付行で曜日が括弧に重なる（バグ修正）

**所有者の所見**: 実機のスクリーンショットで、アイドル時計の日付行「11月11日（水）」の赤い曜日字が前後の括弧に重なってはみ出している。

**原因**: 舞台の字の測り方（`LyricStage.tsx` の `measureWith`）が、字送りに `SkFont.measureText(char).width` を使っていた。react-native-skia の `measureText` は送り幅ではなく**字面（インク）の外接矩形**を返す（`node_modules/@shopify/react-native-skia/cpp/api/JsiSkFont.h` の `measureText` は `SkFont::measureText` の bounds だけを返し、送り幅の戻り値を捨てている）。全角括弧「（」「）」の字面は 1 字の枠の片側に寄った細い線なので、字送りが 0.3 字ほどに縮み、曜日が「（」の字面に、「）」が曜日に食い込んでいた。`composeClock` の組み方（幅の合計で中央寄せし、字送りずつ並べる）自体は正しく、入力の実寸がずれていた。

**修正**: 字送りを送り幅（`getGlyphIDs` → `getGlyphWidths` の合計）で測る `advanceMeasure`（新規 `src/typesetting/fontMeasure.ts`）にし、`measureWith` をそれに置き換えた。`measureWith` は時計だけでなく歌詞の行・前後行・銘板・歌詞カードの組版すべてで使っているので、**舞台の字送り全体が実寸になる**（横組みの行・前後行・銘板のアーティスト・歌詞カードの字送りが少し広がる。縦組みの直立字の左右中央寄せも送り幅基準になる）。jest の Skia モック（`jest/setupSkia.js`、`LyricStage.test.tsx` のタグ付きフォント）に `getGlyphIDs` / `getGlyphWidths` を足した（幅は従来どおり 1 字 = sizePx なので既存テストの数値は変わらない）。

**判断**: 装飾 `numeral` の右寄せ（`Ornaments.tsx` の `numeralFont.measureText(text).width`）は字面の幅のままにした（右端を字面で揃える用途で、重なりの問題は無い）。

**テスト**（`idleComposition.test.ts`）: 字面と送り幅が違う架空のフォント（括弧は 1 字枠の片側に細い字面、漢字は枠の大半、数字は送りより細い）を `advanceMeasure` に通して `composeClock` を組み、日〜土の 7 曜日すべてで日付行の隣り合う字の字面が重ならないこと、括弧と曜日の隙間が 0.1〜0.5 字で前後対称なことを確かめる。あわせて、字面の幅で測る旧方式では曜日が「（」に食い込むことを確かめ、テストが不具合を検出できることを示す。

### B. アイドル時計にもサウンドメーター

**所有者の所見**: 「サウンドビジュアライザ機能なかったっけ？」。バンドメーターは銘板と歌詞カードにしか出ず、時計のまま聴いている間は音への反応が見えなかった。

**変更**: `composeClock` が `meter`（印刷エリアの足元、全幅、高さの上限 `METER_MAX_HEIGHT`。銘板・歌詞カードと同じ位置）を返し、`LyricStage` が時計のブロック内に `BandMeter` を置く（testID は `idle-band-rule-*`。`BandMeter` に `testIDPrefix` を足した）。無音時の基線・減速表示時の静止・色（surge 込みの ink）・不透明度 0.7・1 フレームの変化量の上限は `BandMeter` 自体の挙動なので、銘板・歌詞カードと同じになる。日付行の足は「メーターの最大高さ＋20px（`CLOCK_METER_GAP`、銘板の `METER_GAP` と同じ）」より上に収める（背の低い画面でだけ効くクランプ。通常の画面では日付の位置は変わらない）。メーターは時計の一部なので、ドロップで曲の舞台に移ると時計と同時に外れる（散る時計の字の退場レイヤーにメーターは含めない）。銘板・歌詞カードでは同じ場所にそれぞれのメーターが出るので、見た目は途切れずに続く。設計書 §5 に追記した。

**テスト**: `idleComposition.test.ts`（メーターの位置と寸法、通常の画面と背の低い画面で日付がメーターの最大高さ＋間隔より上にあること、通常の画面では日付の位置が変わらないこと）、`LyricStage.test.tsx`（時計に 24 本・基線・ink 0.7・別のメーターは無い、日付がメーターの上に収まる、減速表示で静止、時計 → 同期歌詞のドロップで時計のメーターが消え戻らない、時計 → 銘板のドロップでメーターが銘板の 1 列だけになる）。

### C. 歌詞の出方のパターンを広げる

**所有者の所見**: 「歌詞の出方にパターンが全然なさすぎて面白みがない」。

**設計（先に設計書 §4・§5 を改定、改定履歴 2026-11-11 夕）**:
- 入り方の語彙に `print`（一文字ずつ版を押すように 1.12 倍から等倍へ収まりつつ刷り上がる。字ごと 70ms、行全体の広がりは 900ms まで）、`gather`（字ごとに決まった方向へ 90px 離れた位置から、回転なしで一斉にスプリングで寄る、700ms）、`slide`（左 56px から行き過ぎない減速で順に滑り込む。字ごと 30ms、広がり 600ms まで）を足した。退場は `print` → 末尾から消える（trace）、`gather` → 散る（scatter）、`slide` → 右へ 48px 滑り去る（新しい退場）。字ごとの遅れは固定で行の歌唱時間に合わせないので、擬似的な音節同期にはならない。
- 行の置き場所 `placement`（`center` と四隅、省略時は従来の置き方）を語彙に足した。`layoutLine` が組み上がった塊を、装飾の分を除いた印刷エリアの中で丸ごと動かす（はみ出さない）。前後の行・装飾・灯は塊の外接矩形に追従する。
- ルールベースの選択規則（`directSongByRules` を書き直し）:
  - 反復行（同じ本文が 2 回以上）は全出現で `accent: true`（従来どおり）。**再登場（2 回目以降）を格上げ**: 大きさ 1 段上（`xl` は予算内だけ）、装飾は本文から決まる「その行の印」（`frame` か `circle`、同じ本文なら毎回同じ）、滞留 `pulse`、置き場所 `center`、強調文字を最大 3 文字（最初・中ほど・最後の漢字）に、入り方は「決め」（`drop` / `gather` / `print`）から。
  - `xl` の予算（曲中 3 行）は、反復の塊の先頭（構造的な山）の再登場 → ほかの再登場 → 短い行の順に配る。
  - 大小の対比: 普通の行が直前の表示行と同じ大きさなら 1 段ずらす（上げられれば上、`xl` には上げず、`s` より下げない）。
  - 縦横: 英字主体と 20 字超は横（従来どおり）、それ以外は縦。ただし直前 2 行が縦なら 14 字以内の行は横にして 3 行連続を避ける。
  - 同じ出方を続けない: 入り方は直前 2 行と同じものを選ばない。滞留・置き場所は直前の行と変える（再登場の `pulse` / `center` を除く）。候補は本文の性格（感嘆・長い・英字・漢字）から先に並べ、その後ろに語彙全体を seed と行番号のハッシュで回した順。20 字超の行は `scatter` / `gather` を使わない。
  - すべて本文・並び・seed（`アーティスト/曲名`）から決まり、乱数・音量・拍を使わない（決定的）。音量→字の大きさの直結はしていない。
- 検証器（`validateDirection.ts`）は新しい入り方と任意の `placement` を受け付ける（Claude API の出力にも使える）。

**判断**:
- 「似た組み合わせを避ける」は、入り方の直近 2 行の不一致・滞留と置き場所の直前との不一致・大きさの対比・縦の 3 連続回避の組み合わせで実現し、（入り方, 大きさ, 向き）の組を直接比べる規則は置かなかった。入り方が 3 行の窓で必ず違うので、組としても 3 行連続で同じにはならない。
- 再登場の格上げで `xl` が足りないとき（予算切れ）は大きさは据え置き、装飾・滞留・置き場所・強調で格上げする。「再登場は初出以上の大きさ」は保証する（初出が短い行の `xl` を取るのは、`xl` に組める再登場がすべて `xl` を取った後だけなので）。
- 円の装飾は塊の中心から印刷エリアの端までに半径が制限されるので、四隅に寄せた行には小さくなる。ルールベースでは円は再登場（中央）にだけ付くので問題にならない。Claude API の演出が隅の行に円を付けた場合は小さな円になる（不具合ではないが見え方は実機で確認）。
- 開発用フィクスチャ（`fixtureSong.ts`）の演出は変えていない（新しい入り方は含まない）。フィクスチャで新しい入り方を見たい場合は別途足す。
- 既存の舞台テストのうち、前後行・装飾の幾何を従来の置き方で測るもの（`LyricStage.test.tsx` の該当 describe の `withLines`）は `placement: undefined` を明示した。置き場所そのものは `layout.test.ts` で確かめる。

**テスト**: `ruleBasedDirector.test.ts`（架空の 2 番＋サビの曲で: 決定性、入り方が 3 行の窓で重複しない・1 種が 1/3 を超えない、本文の性格からの入り方（漢字 3 行で print/trace/fade、感嘆 3 行で drop/cut/slide、英字 3 行で slide/cut/rise）、長い行は scatter/gather なし、滞留・置き場所が直前と変わる、普通の行の大小対比、縦の 3 連続回避と縦横の混在、再登場の格上げ（大きさ ≥・印の装飾・pulse・中央・強調 ≥・決めの入り方）とサビ 2 番の頭が初出より大きいこと、検証器を通ること。既存のテストはそのまま通る想定）、`motion.test.ts`（print / gather / slide の動き・終わりが恒等・広がりの上限・不透明度が 0〜1 を出ない・退場・減速表示で恒等・1 拍以内の退場）、`layout.test.ts`（置き場所なしは従来と同一、各置き場所で塊が丸ごと動き、印刷エリア内で名前どおりの辺・中央に付く）、`validateDirection.test.ts`（新しい入り方、`placement` の任意・不正値の拒否）。

### 変更ファイル

- `src/typesetting/fontMeasure.ts`（新規。`advanceMeasure`）
- `src/typesetting/LyricStage.tsx`（`measureWith` を送り幅に、時計のメーター）
- `src/typesetting/idleComposition.ts`（`meter`、日付のメーター回避クランプ、`CLOCK_METER_GAP`）
- `src/typesetting/BandMeter.tsx`（`testIDPrefix`）
- `src/typesetting/motion.ts`（print / gather / slide、slide の退場）
- `src/typesetting/layout.ts`（`placement` の適用 `placeBlock`）
- `src/direction/types.ts`（`Entrance` に 3 種、`Placement`、`LineDirection.placement?`）
- `src/direction/validateDirection.ts`（新しい入り方と `placement`）
- `src/direction/ruleBasedDirector.ts`（選択規則の書き直し）
- `jest/setupSkia.js`（フォントモックに送り幅）
- テスト: `src/typesetting/__tests__/idleComposition.test.ts`、`src/typesetting/__tests__/LyricStage.test.tsx`、`src/typesetting/__tests__/motion.test.ts`、`src/typesetting/__tests__/layout.test.ts`、`src/direction/__tests__/ruleBasedDirector.test.ts`、`src/direction/__tests__/validateDirection.test.ts`
- `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（改定履歴、§4 語彙・ルールベース、§5 入り方・時計のメーター）
- `docs/superpowers/reports/2026-11-09-visual-overhaul-progress.md`（この節）

### 実機で確認すること（時計の曜日・時計のメーター・歌詞の出方）

- 時計の日付行「M月D日（曜）」で、曜日（赤）が括弧に重ならず、括弧との間隔が自然。日〜土の全曜日（日付を待つか端末の日付を変えて）。
- 送り幅で測るようになったことで、横組みの歌詞行・前後行・銘板のアーティスト・歌詞カードの字間が不自然に広がっていない（特に英字・括弧・句読点）。時計の時刻の桁が詰まり過ぎ・空き過ぎでない。縦組みの直立字が列の中央に立っている。
- 時計のまま音楽を流すと足元のメーターが反応し、無音で基線に伏せる。日付・caption・操作列と重ならない。iPhone SE 相当の背の低い画面でも日付がメーターに掛からない。
- 時計 → 同期歌詞の曲（ドロップ）で時計のメーターが残らない。時計 → 銘板・歌詞カードでメーターが 1 列のまま途切れずに続く（二重にならない）。
- 歌詞の入り方 `print`（刷り上がり）・`gather`（寄せ集め）・`slide`（滑り込み）が、縦組み・横組みの両方で崩れない。長い行の `print` / `slide` が間延びしない。退場（slide は右へ）が次の行と喧嘩しない。
- 行の置き場所（四隅・中央）で、前後行・装飾（rule / frame）・灯が行に追従し、ワードマーク・caption・操作列に掛からない。
- 同期歌詞の曲で、出方が単調でなく、それでいて置物としてうるさくない。サビの再登場（中央・枠か円・pulse・大きく）が「決め」として効いている。拍頭で全面が光る・点滅する見え方が無い。
- fps 55 以上（gather / print の行の入り、メーターつきの時計）。

### 据え置き・申し送り

- 新しい入り方の数値（print 70ms・900ms・1.12 倍、gather 90px・700ms、slide 30ms・600ms・56px）、縦の 3 連続回避の 14 字、対比の上限は実機の見え方で調整する（定数は `motion.ts` と `ruleBasedDirector.ts` の先頭）。
- フェーズ 3（Claude API の演出）のシステムプロンプトには、新しい語彙と「同じ出方を続けない」「再登場の格上げ」を書き足す必要がある（未実装のため今回は設計書の語彙だけ）。
- **未検証**: この環境ではエージェントのシェルからのテスト・typecheck を実行していない（呼び出し側で実行が必要）。実機も未確認。

### ビルド14の検証で落ちた 7 件の判定と修正（2026-11-11）

相棒の検証: typecheck 通過、830 件中 823 件通過。落ちたのは `LyricStage.test.tsx` 2 件（「context lines stay inside the print area…」「the line, its context lines and its ornament stay inside the print area, for every ornament」）、`motion.test.ts` 4 件（print の字ごと 70ms、print の広がり 900ms、slide の行き過ぎなし・30ms・600ms、full ink を超えない）、ほか 1 件（実行条件で揺れる。下記）。

**判定: 6 件とも本番の不具合で、原因は 1 つ。** `motion.ts` の `staggerMs`（worklet）が、ファイル内で**後ろに**宣言した worklet `cappedStagger` を呼んでいた。react-native-worklets 0.10 の Babel プラグイン（`babel-preset-expo` が jest でも自動で入れる）は、`'worklet'` の関数宣言を `const staggerMs = (factory)({ cappedStagger, … })` に書き換え、呼ぶ関数を**定義の時点の値で**取り込む。関数宣言の巻き上げはこの変換で失われるので、`staggerMs` が取り込む `cappedStagger` はまだ初期化されておらず、print と slide の字ごとの遅れを計算した時点で落ちる（JS スレッドでも UI スレッドでも同じ）。実機でも print / slide の行が出た瞬間に同じ例外になっていたはず。
- motion の 4 件: どれも print または slide の遅れを通る（`glyphTransform` / `entranceDurationMs`）。gather は `staggerMs` を通らないので、gather だけのテスト・退場・減速表示・1 拍以内の退場のテストは通っていた。この切り分けと結果が合う。
- LyricStage の 2 件: どちらも中の行が 25 字の「窓のむこうに朝を数えているまだ名前のない歌をひとつ」。20 字超の行の入り方の候補は `slide` / `print` / `fade` の順（`ruleBasedDirector.ts`）なので、主役の行の動きの導出（`GlyphLayer` の `useDerivedValue` → `glyphTransform`）が描画中に落ちていた。短い行のテストは別の入り方になるので落ちない。**組版の不具合ではない**: `contextLine` は塊を `area` に左右・上下でクランプしており（下端を優先）、送り幅で測って広がった塊にも、`placement` で動いた主役の行にも効く。テストの期待は変えていない。
- テストの前提はどれも設計書 §5 と一致しており（print: 字ごと 70ms・広がり 900ms まで・1.12 倍から等倍、slide: 行き過ぎなし・30ms・600ms まで、不透明度 0〜1）、変更前の式もこの数値どおりだった（手で追って確認: print の 5 字は 4×70+160 = 440ms、60 字は 900/59 ms ずつ、slide は easeOut で単調に 0 へ）。テストは変えていない。

**修正**: `motion.ts` で `cappedStagger` を `staggerMs` の前に移した（中身は無変更）。worklet は呼ぶ worklet より後ろに置く必要があることをその関数のコメントに残した。ほかの worklet の並びも確かめた（`glyphTransform` / `exitTransform` / `entranceDurationMs` が呼ぶ `easeOut` / `clamp01` / `spring` / `hashSigned` / `anticipation` / `staggerMs` などはすべて呼ぶ側より前）。今回触ったほかのファイル（`BandMeter.tsx` / `fontMeasure.ts` / `idleComposition.ts` / `layout.ts`）には、後ろの worklet を呼ぶ worklet は無い。

**残りの 1 件**: 2 スイートだけの実行では出ず、どのテストかの記録も無いので、この環境では特定できていない。同じ原因（print / slide の行を描く別スイート）なら今回の修正で消える。消えなければ、AGENTS.md 既知のタイムアウトのフレーク（`useBurnInDrift.test.tsx` の 5000ms）を疑い、テスト名を記録して単独で再実行する。

**未検証**: エージェントのシェルはブロックされているので、修正後のテストは実行していない。呼び出し側で `npm test -- --watchman=false` と `npm run typecheck` を実行して結果を記録する。

## ビルド 15: 音の見え方のパターンと歌詞部品の第一陣（仕様化、2026-11-16、ブランチ `feat/stage-patterns`、a840174 の上）

### 経緯

- 所有者がビジュアライザのモックを承認した（罫バー強化版・波形の線・波紋・点描グリッド・縦罫のカーテン・円環スペクトラム・音の景色）。音の景色の初版は「景色感がない」として却下され、地平へ高速で駆け抜ける版に作り直したものが承認された。
- JIZURA（852wa、MIT License）の表現部品 1,715 件を棚卸しした調査書 `docs/jizura-parts-survey.md` ができた（候補 477 件、推奨トップ 10、構成作法 11 項目）。
- 今回は**仕様化だけ**で、実装はしていない。設計書に §9 を新設し（改定履歴 2026-11-16、アンチゴールの例外にビジュアライザの局所の拍の閃光を追加、§4 の語彙から §9 への参照）、この節に実装の分割案を置く。

### 仕様化した範囲（設計書 §9）

- **§9.1 音の見え方のパターン。** 現行のバンドメーターを `bars` として存続させ、`bars-bold` / `wave`（足元型）、`ripple` / `stipple` / `curtain` / `ring` / `landscape`（背面型）を足す。曼荼羅は候補として名前だけ。選び方は、確定後に無音でない 8 秒（最長 20 秒）の音響特徴（テンポ・エネルギー・低中高のバランス・拍の安定度）を量子化して表に当て、候補が複数なら seed で 1 つに決める。`trackId` ごとに覚え、キーだけを保存するので、再認識しても同じ。時計とパターンが決まるまでは `bars`。反応の強さ `VIZ_GAIN` はモックの尺度で 1.15（現行は約 0.45 相当）。輝度の規律（線と点だけ、不透明度の上限、画面平均への寄与の上限、拍の閃光は要素に局所化し画面の 10% 以下、無音・減速表示で静止）。
- **§9.2 歌詞部品の第一陣。** 掛け軸（登場）、校正で削る（退場）、呼吸（保持。既存の `breathe` に字間の呼吸を足す）、風鈴（保持）、奥付（装飾）、青海波（装飾）、字間収束・拡張（登場）、ルビ振り（レイアウト。実読みがある行だけ）、縦罫に畳む（退場）、拍で呼吸（カメラ）。それぞれに狙う体験・動き・場面・アンチゴールとの境界を書いた。`LineDirection` に `exit?` / `ruby?` / `camera?` を足す。出典は JIZURA で、再実装であってコードの複写ではないことと、将来 `THIRD_PARTY_NOTICES` に載せる前提を明記した。
- **§9.3 ディレクター規則の拡張。** セクション（空行で区切る。反復の塊は 1 セクション、空行が無ければ 8 行ごと）ごとのパレット（入り方 3・退場 2・滞留 1・装飾 2・置き場所 3・カメラ 1）、強い動きはキメ行に温存、繰り返し行の `repeatMode`（`promote` 格上げ / `replay` 完全再現）、新奇性の減衰と適合ゲート、足し算の上限、微細組版（かなの字送り詰め・助詞の縮小・行頭字の拡大・欧文の拡大と境界の間隔）。調査書の作法の番号との対応表つき。作法 5・6・10・11 は今回は取り込まない（記録のみ）。

### 判断（仕様化、所有者の確認がほしいもの。設計書 §9.4 と同じ）

1. **同期歌詞の舞台にもビジュアライザを出す。** 依頼の「認識後にその曲のパターンへ」を、銘板・歌詞カードだけでなく同期歌詞の舞台にも当てた。歌詞を主役に保つため、背面型は不透明度 0.6 倍にし、主役の行の外接矩形から 16px 外までは描かない。
2. **歌詞カードでは背面型を出さない。** 全文一枚の本文の後ろに線画が動くと読みにくく、行を追わない約束（フェイク同期の禁止）とも紛らわしい。曲のパターンが背面型なら `bars-bold` に置き換える。
3. **足元型の高さは据え置き。** `METER_MAX_HEIGHT`（36px）のまま。時計の日付・銘板のアーティスト行・歌詞カードの本文の領域が動かないようにした。強化版の強さは 48 本・ピークの刻み・`VIZ_GAIN` で出す。
4. **`VIZ_GAIN` 1.15 は時計の `bars` にも掛ける。** 「時計は穏やか」は、パターンを `bars` にすることと拍の閃光を使わないことで表した。時計だけ弱くしたければ、時計用の係数を分ける。
5. **再認識で同じパターンにするために、キーを端末に保存する。** 実機の音響特徴は聴くたびに揺れ、閾値の近くの曲は段が変わりうる。セッション内のメモだけだとアプリの再起動で変わるので、演出のキャッシュと同じ保存先に**パターンのキーだけ**を保存する（特徴量の値・音声は保存しない。製品の決まりの「音声を端末の外に送らない」にも触れない）。
6. **拍の閃光の扱い。** 設計書のアンチゴールの「点滅」の定義（1 秒に 2 回以上・振幅 20% 超）だと、120 BPM 以上の拍の閃光は形式上「点滅」に当たる。そこで、§5 の拍頭のグローと同じ例外として、要素に局所化（画面の 10% 以下）し、画面平均への寄与を +2/255 以下に抑える条件で認めると設計書に明記した。
7. **セクションの入り方の上限は 3。** JIZURA は 2 だが、ビルド 14 の「直前 2 行と同じ入り方は選ばない」（所有者の所見「出方にパターンが無い」への対応）をパレットの中で満たすため 3 にした。滞留は JIZURA どおりセクションで 1 つに揃え、ビルド 14 の「滞留は直前と変える」はセクションの境で効かせる。
8. **音の景色の数値は目安。** 視差の比（1 : 2.5 : 6）、最低速度（等高線が地平から下端まで 3 秒以内）、キックの加速（+60%・400ms）は、モックの見え方をもとにした初期値。実装時にモックの式があれば、そちらを優先する。
9. **ルビはフェーズ 3 まで実質出ない。** ルールベースには読みの辞書が無く、推測した読みを刷るのは嘘になるので付けない。部品と検証器は 15c で作っておく。

### 決定（2026-11-16、所有者承認。設計書 §9.4 を「決定済み」に更新）

上の判断のうち次の 4 点を、所有者（佐事）が承認した。実装（15a）はこれに従う。
1. **同期歌詞の舞台にもビジュアライザを出す。** 背面型は不透明度 0.6 倍、主役の行の外接矩形から 16px 外までは描かない。足元型は従来の位置（版面の足元の帯）。（判断 1）
2. **`VIZ_GAIN` 1.15 は時計の `bars` にも掛ける。**（判断 4）
3. **歌詞カードでは背面型を出さず `bars-bold` にする**（曲のパターンにかかわらず固定）。（判断 2）
4. **選ばれたパターンのキーだけを端末に保存する。**（判断 5）

判断 3・6〜9 は未確認のまま、仕様化した内容を実装の前提にする。

### 実装の分割案

各段階で、失敗するテストを先に書いてから実装する（AGENTS.md）。段階の終わりに相棒が `npm test -- --watchman=false` と `npm run typecheck` を回して、結果をここに残す。作業ブランチは `master` の最新から `feat/build15-patterns` を切ることを提案する（`feat/stage-patterns` はビルド 14 の PR 用に残す）。

- **15a ビジュアライザの基盤と選択規則**
  - パターンの型と舞台への差し込み口（`VisualizerKey`、足元型 / 背面型、1 舞台 1 パターン、`bars` からのクロスフェード）。現行の `BandMeter` を `bars` として載せ替えるだけで、見た目は変えない。
  - 音響特徴の観測窓と量子化、対応表、seed による割り振り（純関数。合成した特徴量の列でテストする）。`trackId` ごとのメモと、キーの保存。
  - `VIZ_GAIN`（モックの写像を移す）と輝度の規律の共通部品（追従器、50ms 打ち切り、クランプ、画面平均への寄与の見積り）。
  - 舞台ごとの出し方（時計 `bars`、銘板、歌詞カードは足元型だけ、同期歌詞の舞台は 0.6 倍と切り抜き）。
  - 触る見込みのファイル: 新規 `src/visualizer/`（選択・特徴量・共通の規律）、`src/typesetting/bandMeter.ts` / `BandMeter.tsx`、`LyricStage.tsx`、`idleComposition.ts` / `nameplate.ts` / `plainSheet.ts`（足元帯の受け渡しだけ）、演出のキャッシュ。
- **15b パターン各論**
  - `bars-bold` → `wave` → `ripple` → `stipple` → `curtain` → `ring` → `landscape` の順（足元型から。景色は最も重いので最後）。各パターンに、帯域・拍・無音・減速表示・クランプ・局所の閃光（範囲と寄与の上限）・版面に収まることのテストを書く。
  - `landscape` は「静止した風景画にしない」をテストで縛る（音がある間の最低速度、キックで加速、無音で 1.5 秒で停止）。
  - 描画ノードの数と fps の見積りを、パターンごとにこのファイルに残す。
- **15c 歌詞部品の第一陣**
  - 語彙の追加: `types.ts`（`Entrance` / `Hold` / `Ornament` の追加、`exit?` / `ruby?` / `camera?`、`SongDirection.repeatMode?`）、`validateDirection.ts`（新しい値、ルビの範囲と読みの検証）。
  - 動き: `motion.ts`（`kakejiku` / `track-in` / `track-out` の登場、`proof-delete` / `condense` の退場、`breathe` の字間、`furin`）。worklet は呼ぶ側より前に置く（ビルド 14 の落とし穴）。
  - 図形: `Ornaments.tsx`（`colophon` / `seigaiha`）、掛け軸の巻棒・校正の斜線・縦罫・吊り糸、ルビの組版（`layout.ts`）、カメラ（`LyricStage.tsx` の文字レイヤーの拡大）。
  - 出典コメント（JIZURA の部品名）を各実装の先頭に。
  - ルールベースへの組み込みは 15d。15c の時点では開発用フィクスチャの演出で全部品を見られるようにする（フィクスチャは架空の歌詞のまま）。
- **15d ディレクター規則の拡張**
  - `ruleBasedDirector.ts`: セクション分け、パレット、キメ行と強い動きの温存、`repeatMode`、適合ゲート、新奇性の減衰、相性表、重みによる決定的な選択、足し算の上限。ビルド 14 のテストのうち、規則が変わるもの（滞留を直前と変える）は、設計書 §9.3 に合わせて書き換える（変える理由をここに記録する）。
  - `layout.ts`: 微細組版（同期歌詞の主役の行と前後行だけ）。既存の版面に収まることのテストは通したままにする。
  - フェーズ 3 のシステムプロンプトへの申し送り（新しい語彙、セクションのパレット、キメ行、`repeatMode`、ルビは確かな読みだけ）。

### 実機で確認すること（ビルド 15）

- **15a**: 時計のメーターが 1.15 で、うるさすぎず、反応が見える。曲の確定から 8〜20 秒で曲のパターンへ 1 回だけ滑らかに移る。同じ曲をかけ直す・アプリを再起動しても同じパターンになる。違う性格の曲（速い・遅い・低域の強い・高域の明るい）で、パターンが分かれる。
- **15b**: 各パターンで全面が光らない（160 BPM 以上の曲で、拍の閃光が局所に留まる）。背面型の下で歌詞・銘板が読める（同期歌詞の舞台の 0.6 倍と切り抜きが効いている）。**音の景色が「駆け抜けている」と感じられる**（静かな曲でも止まって見えない、キックで前へ押される、無音で減速して止まる）。fps 55 以上、10 分放置で発熱が気にならない（特に `landscape` と `stipple`）。
- **15c**: 掛け軸が縦組みで格よく下りる。校正の斜線・縦罫に畳むが 1 拍以内に収まり、次の行と喧嘩しない。風鈴の揺れが小さく、`shake` に見えない。奥付・青海波が版面の隅に収まり、前後行・ワードマーク・caption と重ならない。字間収束・拡張で塊が版面からはみ出さない。拍で呼吸が「揺れ」や酔いに感じない。
- **15d**: 1 つのパートの中で出方が揃って見え、パートが替わると変わる。キメ行（サビ頭・感嘆の行）だけが強く動く。`replay` の曲で、再登場が初回と同じ見せ方で「戻ってきた」と感じる。微細組版で、かなが詰まり助詞が小さくなった行が自然に読める（誤判定で小さくなった字が目立たない）。

### 据え置き・申し送り

- 曼荼羅は候補の名前だけ。第二陣で検討する。
- 調査書の次点（原稿用紙、襖渡し、網点、かな小組み、柱とノンブル）と、作法 5・6・10・11 は今回の範囲外。
- `THIRD_PARTY_NOTICES` の追加は、配布の形（TestFlight にするか）が決まったときに行う。それまでは各実装ファイルの出典コメントで出典を残す。
- 拍で呼吸（カメラ）と焼き付き回避のドリフトの重ね方は 15c で実測して決める。
- **未検証**: 文書だけの変更で、テスト・typecheck は実行していない（コードの変更は無い）。モックの実物はリポジトリに無く、§9.1 の数値は依頼文とモックの説明からの初期値。

### 変更ファイル

- `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（改定履歴 2026-11-16、アンチゴールの例外、§4 から §9 への参照、§9 新設）
- `docs/superpowers/reports/2026-11-09-visual-overhaul-progress.md`（この節）
- 調査書 `docs/jizura-parts-survey.md` は未追跡のまま（作ったのは別の作業。コミットに含めるかは所有者が決める）

## ビルド 15a: ビジュアライザの基盤と選択規則（2026-11-16、ブランチ `feat/stage-patterns`、bb01265 の上）

実行環境の再起動で途中まで（`src/visualizer/` の 6 ファイル、`BandMeter.tsx` / `bandMeter.ts` / `LyricStage.tsx` の変更）で止まっていた作業を引き継いで完成させた。既にあったものは作り直さず、残り（アプリへの配線、テスト、文書）を足した。ブランチは分割案の `feat/build15-patterns` ではなく、作業ツリーのある `feat/stage-patterns` のまま（切り直すかは相棒・所有者が決める）。

### 実施内容

- **パターンの基盤**（`src/visualizer/patterns.ts`、`registry.tsx`、`StageVisualizer.tsx`）: キー 8 種（`bars` / `bars-bold` / `wave` / `ripple` / `stipple` / `curtain` / `ring` / `landscape`）と足元型・背面型の別。舞台ごとの出し分けは純関数 `planStageVisualizer`（時計 = `bars`、銘板 = 曲のパターン、歌詞カード = `bars-bold` 固定、同期歌詞 = 曲のパターンで、背面型なら不透明度 0.6 倍と主役の行の 16px 外までの切り抜き `clearance`）。レンダラは `PATTERN_RENDERERS` に 1 パターン 1 項目（輝度の最悪値 `budget` つき）で登録し、項目の無いパターンは `bars` で描く。15b は項目を足すだけで差し替わる（`LyricStage.test.tsx` で、背面型を登録すると同期歌詞の舞台で 0.6 倍・切り抜きつきで渡ることを確かめている）。今回描けるのは `bars`（従来のバンドメーターそのまま）と `bars-bold`（48 本、各罫の頭に 2px の刻みが 600ms で落ちる、キックで低域側 1/3 の刻みだけが accent に灯る）。`bars` から曲のパターンへは 1.2 秒のクロスフェード（減速表示では即時に入れ替え）。
- **舞台への差し込み**（`LyricStage.tsx`）: 舞台ごとに 1 つの `StageVisualizer` を文字のキャンバスの最初（質感の上、字の下）に置き、舞台の種類で key を分けた（舞台が替わればそのまま退く）。銘板・歌詞カード・時計にあった `BandMeter` の直書きを外した。testID の接頭辞は従来どおり（時計 `idle-band-rule`、銘板・歌詞カード `band-rule`）で、同期歌詞は `line-band-rule`。`StageSource` の synced / unsynced / plain に任意の `pattern` を足した。
- **選択規則**（`selectPattern.ts`）: 確定後の観測窓（無音でない 8 秒、確定から最長 20 秒。フレーム間は 100ms で打ち切り）で、テンポ（中央値）・テンポのばらつき（中央絶対偏差 / 中央値）・テンポのある時間の割合・拍の信頼度・エネルギー・低中高を時間で重みづけて平均し、粗い段（テンポ 3 段＋不明、エネルギー 3 段、バランス 3 段、安定度 3 段）に量子化して §9.1 の表に上から当てる。候補が複数なら seed（`アーティスト/曲名` の fnv1a）で 1 つ。純関数で、同じ特徴量列と seed なら必ず同じ。
- **永続化**（`patternStore.ts`）: `trackId → キー` だけを文書ディレクトリの `musicage-patterns.json` に保存（`{ "patterns": { … } }`。書き出し・読み込みの両方で既知のキー以外を捨てる）。セッション内のメモ（`PatternBook`、最大 256 曲、古いものから忘れる）が保存済みのキーを起動時に 1 回読み、読み込み前に決まった曲は自分の選択を優先し、保存済みのキーも失わない。保存の失敗はセッションの記憶を壊さない。
- **アプリへの配線**（`useStageSource.ts`、`MusicageApp.tsx`）: 確定した曲（新しい `trackId`、またはフィクスチャの開始）ごとに観測を始め、耳のフレームを観測器に渡す（耳の購読の中、再レンダーは決まった 1 回だけ）。ブックに覚えている曲は観測を待たずにそのキー。保存済みのキーの読み込みが観測中に終わったら、そこで見つかった曲は観測をやめてそのキーにする。アプリは端末のブック（`devicePatternBook()`）を渡す。フィクスチャの選択はセッションの間だけ覚え、端末には保存しない。
- **`VIZ_GAIN`**（`discipline.ts`、`bandMeter.ts`）: モックの「反応」の尺度で 1.15。従来の写像（帯域値をそのまま）を 0.45 とし、帯域値 × 1.15 / 0.45（約 2.56 倍）を 0〜1 にクランプ（飽和）。`meterTarget` の既定がこれになり、時計の `bars` を含む全舞台に掛かる。写像の式はモックの実物がリポジトリに無いので線形＋飽和にした（モックの式が分かれば差し替える）。
- **輝度の規律**（`discipline.ts`）: 各レンダラが最悪の場合（全要素が最大・最大不透明度）のインク面積 × 不透明度と、閃光の面積・増分を `budget` で申告し、`lightBudgetOf` が画面平均への寄与（白インク・黒地の上限見積り、1/255 単位）と閃光の画面比に直して、常時 +3/255・閃光 +2/255・閃光の面積 10% の上限と照らす。テストが登録済みの全レンダラを iPhone SE（375×667）と 390×844 で検査するので、15b のパターンも登録した時点で縛られる。

### 判断

- **キーの名前.** 依頼文の一覧の `dots` は、設計書 §9.1 の `stipple`（点描グリッド）のこととして、設計書どおり `stipple` にした。
- **保存先.** 設計書の「演出のキャッシュと同じ保存先」は、演出を端末に保存していない（LRCLIB の答えのキャッシュはセッション内だけ）ので、設定ファイルと同じ文書ディレクトリの別ファイルにした。設計書 §9.1 の該当文に注記した。
- **同期歌詞の舞台の足元型.** 版面の足元の帯（`area.bottom`、時計・銘板と同じ位置）に置いた。主役の行・前後行の組版は変えていないので、置き場所が下の隅の行や下に寄った前後行とメーターが重なりうる（実機で確認。重なるなら 15b で行の領域から足元帯を除くか、足元型も切り抜く）。
- **空の行の間.** 同期歌詞の舞台で行の無い間は舞台が時計（idle）になるので、そのとき出るのは時計の `bars`。曲のパターンは次の行で戻る（舞台の種類が替わるのでクロスフェードはしない）。
- **テストの書き換え（既存 2 件、仕様変更による）.** `bandMeter.test.ts` の「帯域値をそのまま 0〜1 にクランプ」（`meterTarget(0.4, 0) ≈ 0.4`）は `VIZ_GAIN` で前提が変わったので、基準の係数 0.45 で従来の値になること・既定で約 2.56 倍になることを確かめる形に書き換えた。`LyricStage.test.tsx` の歌詞カードの「メーターが 24 本」は、決定 3 で `bars-bold` 固定になったので 48 本（`METER_BOLD_RULE_COUNT`）にした。
- **足元型の全体の明るさ.** `bars-bold` の最悪値は 390×844 で +2.0/255、375×667 で +2.6/255（上限 3）。初代 SE（320×568）では +3.6/255 になり上限を超える（対象外の画面として扱った。対象に入れるなら本数を画面幅で減らす）。

### 変更ファイル（15a）

- 新規 `src/visualizer/patterns.ts`、`selectPattern.ts`、`patternStore.ts`、`discipline.ts`、`registry.tsx`、`StageVisualizer.tsx`
- `src/typesetting/bandMeter.ts`（`VIZ_GAIN`、`bars-bold` の刻み・キック・最悪値）、`src/typesetting/BandMeter.tsx`（`variant` / `accent` / `gain`）、`src/typesetting/LyricStage.tsx`（舞台ごとの `StageVisualizer`、`StageSource.pattern`）
- `src/app/useStageSource.ts`（観測と選択、ブック）、`src/app/MusicageApp.tsx`（端末のブック）
- テスト: 新規 `src/visualizer/__tests__/selectPattern.test.ts`（量子化・表・決定性・seed・観測窓・無音・打ち切り・同じ列で同じ結果）、`patterns.test.ts`（出し分け・フォールバック・切り抜き・クロスフェード）、`discipline.test.ts`（ゲイン・輝度の上限を全レンダラで）、`patternStore.test.ts`（キーだけ・不正値を捨てる・再起動で同じ・読み込み前の選択・失敗に強い・上限）。既存に追記: `src/typesetting/__tests__/bandMeter.test.ts`（ゲイン、`bars-bold`）、`src/typesetting/__tests__/LyricStage.test.tsx`（舞台ごとの出し分け・ゲイン・クロスフェード・背面型の 0.6 倍と切り抜き、歌詞カードの本数）、`src/app/__tests__/useStageSource.test.tsx`（8 秒まで `bars`・1 回だけ決まる・キーだけ保存・再認識と再起動で同じ・別の曲で戻る・無音では決めない）
- `docs/superpowers/specs/2026-10-18-lyric-typography-object-design.md`（改定履歴、§9.1 の保存先、§9.4 を決定済みに）
- `docs/superpowers/reports/2026-11-09-visual-overhaul-progress.md`（決定、この節）

### 実機で確認すること（15a、上の「ビルド 15」の 15a に追加）

- 同期歌詞の舞台で足元のメーターが、下の隅に置かれた行・前後行・caption と重ならない。
- 歌詞カードの `bars-bold`（48 本・刻み・キックの accent）が本文の読みを邪魔しない。キックの accent が点滅に見えない。
- 時計・銘板のメーターが 1.15 で振り切れっぱなしにならない（大きな音量で常に天井に張り付くなら写像を飽和の手前で寝かせる曲線に替える）。
- 曲の確定から 8〜20 秒で `bars` → 曲のパターンへ 1.2 秒で 1 回だけ移る（今は描けるのが `bars` / `bars-bold` だけなので、見える変化は `bars-bold` が選ばれた曲だけ）。同じ曲の再認識・アプリの再起動で同じ。

### 据え置き・申し送り

- 15b でレンダラを足すときは `PATTERN_RENDERERS` に項目（`Component` と `budget`）を足す。背面型は `clearance` と `opacityScale` を受け取り、`clearOfLine` で切り抜く。`discipline.test.ts` が登録済みの全パターンの輝度を検査する。
- 観測の閾値（テンポ 130 / 90、エネルギー 0.05 / 0.12、低域 45%・高域 38%、信頼度 0.55 / 0.3、ばらつき 0.03 / 0.08）は初期値。実機の特徴量の分布を見て調整する（定数は `selectPattern.ts` の先頭）。
- **未検証**: エージェントのシェルはテスト・typecheck の実行がブロックされているので、`npm test -- --watchman=false` と `npm run typecheck` は実行していない（呼び出し側で実行して結果をここに残す）。実機・EAS ビルドも未確認。

### 15a の検証で落ちた歌詞カード（§7）の describe の判定と修正（2026-11-16）

相棒の検証: typecheck 通過、900 件中 896 件通過（単独実行では 7 件落ち）。落ちたのは `LyricStage.test.tsx` の歌詞カードの describe だけで、どれも時間を進めるテスト（長文が時間で変わらない、認識のドロップ、シート ⇄ 銘板、無音をはさむ戻り、同期行 ⇄ シート）。実行時間が 6〜31 秒で、件数が実行ごとに 4 件と 7 件のあいだで揺れた。

**判定: 本番の無駄による負荷増のタイムアウト。遷移や本文の不具合ではない。** 期待の値が仕様変更でずれたのでもない（24 本→48 本はすでに書き換え済みで、本数を見るテストは通っている）。
- `bars-bold` のフレームコールバックは、刻みの高さを毎フレーム**新しい配列**にして `peaks.value` に書いていた。Reanimated 4 の `valueSetter` が同じ値の書き込みを読み飛ばすのはプリミティブだけ（`_value === value`）。配列は毎回別物なので、48 個の `PeakTick` の `useDerivedValue` が毎フレームすべて走り直していた。刻みが全部 0 で止まっている無音の部屋でも同じで、実機でも UI スレッドで毎秒 60 回、48 の mapper と 48 要素の配列の確保が無駄に起きていた。`bars` の 24 本は追従値（`lowNow` など）が変わらなければ何も走らないので、従来は止まった部屋がほぼ無料だった。
- このテスト群の拍の値は帯域 0・pulse 0 なので、本来なら罫も刻みも動かない。それでも jest のフレームループ（1 act で約 60 フレーム）が 1 フレームごとに 48 の mapper を回していたので、10〜33 秒を進めるテストが既定の 5 秒（長文の 2 件は 30 秒）を超えていた。件数が揺れるのは、マシンの負荷次第で時間切れの境目をまたぐため。他の describe は進める時間が短いか、`bars-bold` を出さないので落ちなかった。

**修正**（本番、`BandMeter.tsx`）: 刻みのどれかが動いたフレームでだけ新しい配列を作って書くようにした。動かない間は書き込みが無く、刻みの mapper は 1 つも走らない。キックの `flash` はプリミティブなので、もともと同じ値の書き込みは読み飛ばされる。刻みの動き（跳ね上がり・600ms の落下）は変えていない。テストの期待・タイムアウト・待ち方は変えていない。

**未検証**: 修正後のテストと typecheck は実行していない（エージェントのシェルはブロックされている）。呼び出し側で `npx jest src/typesetting/__tests__/LyricStage.test.tsx --watchman=false` を実行し、歌詞カードの describe が 5 秒・30 秒の枠に十分収まるかを記録する。まだ重い場合は、次に疑うのは `StageVisualizer` の `incoming` / `outgoing`（舞台の時計で毎フレーム走る。クロスフェードの無い間は定数で足りる）。

**結果（相棒の再実行）**: `LyricStage.test.tsx` の失敗は 7 件 → 2 件。残りはどちらも 5 秒のタイムアウトで、どちらも歌詞カードに 10 秒いる遷移のテスト（「シート → 銘板（同じ曲の再解決）」と「長文のシート → 1 回の idle → 別の曲の同期行」、`passTo(START + 10_000)` を含む）。

### 残り 2 件のタイムアウトの判定と修正（2026-11-16、2 回目）

**判定: 前回と同じく、本番の毎フレームの無駄による負荷増。遷移や表示の不具合は見つからなかった。** 2 件はどちらも歌詞カードの舞台で 10 秒（約 625 フレーム）を進めるので、歌詞カードで毎フレーム残っている仕事がそのまま効く。読んで確かめたこと:
- Reanimated の jest 実行時は、共有値の書き込みのたびに mapper の実行がその場で走り、`useDerivedValue` の入力はワークレットが**捕まえた**共有値すべて（その分岐で読むかどうかに関係ない）。同じ値の書き込みはプリミティブなら読み飛ばされる。
- **`StageVisualizer` の `incoming` / `outgoing`**: どちらも `time` を捕まえていたので、クロスフェードの無い舞台（歌詞カードは常に `bars-bold` 固定なので一度もクロスフェードしない）でも毎フレーム 2 つの mapper が走っていた。クロスフェードが終わった後も `sinceMs` が残るので、銘板・同期歌詞の舞台でも曲の終わりまで毎フレーム走り続けていた（実機の UI スレッドでも同じ）。
- **`bars-bold` のフレームコールバック**: 前回の修正で書き込みは止まったが、48 本の刻みの計算（帯域の補間と落下の追従、共有値の読み 3×48 回）は静かな部屋でも毎フレーム回っていた。
- **キックの不透明度**: 低域側 16 本の刻みがそれぞれ同じ `METER_OPACITY × flash` を `useDerivedValue` で持っていた（キックのたびに同じ計算が 16 回）。
- 調べて問題が無かったもの: 帯域の追従値（拍の値が 0 なので書き込みは無い）、本文 `PlainBody` の不透明度（mapper 1 つ、フェードの後も走るが 1 つだけ）、jest のフレームループの二重起動（`activeFrameCallbacks` が 0 になるたびに `nextCallId` が進むので起きない）、Skia のモック（`Canvas` は `View` で、共有値の購読は無い）。

**修正**（本番のみ。テストの期待・タイムアウト・待ち方は変えていない）:
- `StageVisualizer.tsx`: クロスフェードの間だけ `time` を捕まえ、それ以外は動かない共有値（`still`）を捕まえる。クロスフェード終了のタイマー（1.2 秒＋80ms）で、出ていくパターンを外すのと一緒に `sinceMs` も null に戻す（その時点で `crossfadeIn` は 1 なので見た目は変わらない）。クロスフェードの無い舞台・減速表示・クロスフェード後は、2 つの不透明度が 1 回計算されるだけになる。
- `BandMeter.tsx`: 追従値が動かず、全部の刻みが自分の罫の到達点に乗っている（`peaksSettled`）間は、48 本の刻みの計算を飛ばす。落ち着いたと見なすのは時間の経ったフレーム（dt > 0）で刻みが 1 つも動かなかったときだけ（dt = 0 の最初のフレームでは到達点より上の刻みも動かないので、それを落ち着いたと見なすと刻みが止まる）。dt > 0 で動かなかった刻みは到達点ちょうどにあり、追従値が動かない限り次のフレームも同じ値になるので、飛ばしても結果は変わらない。減速表示に入るときは刻みと一緒に解除する。キックの不透明度は `BandMeter` で 1 つだけ導出し、灯る刻みで共有する。刻みの動き（跳ね上がり・600ms の落下）とキックの見え方は変えていない。

**未検証**: 修正後のテストと typecheck は実行していない（エージェントのシェルはブロックされている）。呼び出し側で `npx jest src/typesetting/__tests__/LyricStage.test.tsx --watchman=false` と `npm run typecheck` を実行して結果をここに残す。まだ 2 件が 5 秒を超える場合、次に疑うのは (1) 歌詞カードの見出しの字（`GlyphLayer`、着地後の `still` でも毎フレーム `glyphTransform` を計算する。ビルド 15 より前からある）と (2) jest の後片付けで止まらずに残る前のテストの mapper（`mappers` に溜まり、mapper の開始のたびに全体の並べ替えが走る。テスト側の事情で本番には無い）。どちらもビルド 15 で増えたものではないので、直すかは測ってから決める。

**結果（相棒の再実行、3 回目の依頼時点）**: 残りは 5 秒のタイムアウトが 1〜3 件で、実行ごとに揺れる（直近は「長文のシート → 1 回の idle → 別の曲の同期行」が 5291ms）。ビルド 14 では全通過だったので、15a で増えた毎フレームの仕事に、前からある仕事が重なって境目をまたいでいる。

### 境目に残るタイムアウトの判定と修正（2026-11-16、3 回目）

**判定: 前回の申し送り (1) が本命。本番の毎フレームの無駄で、表示や遷移の不具合ではない。** 歌詞カードの舞台で fake time を進める間、時間に応じて何も変わらないのに毎フレーム走っていた導出:
- **`GlyphLayer` の字ごとの動き**: `motion` のワークレットが `time` と拍の共有値 7 つ（`low` は音があれば毎フレーム書かれる）を捕まえていたので、`hold: 'still'` で着地し終えた字（歌詞カードの見出し `rise`/`still`、アーティスト `fade`/`still`、時計、銘板のアーティスト、前後行、caption）も毎フレーム `glyphTransform` を計算していた。結果が毎回**新しいオブジェクト**なので、字ごとの `transform` と `opacity` の導出も毎フレーム走り直していた（字ごとに 3 つ）。減速表示でも、時計は止まるが拍の共有値の書き込みで同じことが起きていた。
- **`GlyphLayer` の字ごとの色と縁取り**: `color` は移行の分岐でしか `time` を読まないのに、全部の字で `time` を捕まえていた。`strokeWidth` も太い行でない字（`return 0`）まで `time` / `lastOnsetAtMs` / `low` / `confidence` を捕まえていた。どちらも全部の字で毎フレーム 2 つ。
- **`PlainBody` の本文の不透明度**: フェードイン（1.2 秒）の後はずっと 1 なのに、シートが出ている間ずっと毎フレーム走っていた（mapper 1 つ）。
- 調べて問題が無かったもの: `GlowLayer`（強調の字だけで、歌詞カードの見出しには強調が無い）、`Ornament`（歌詞カードは `none`）、`TextureBackground`（シェーダの `iTime` は本当に動く質感なので止めない）、退場中の本文（`PLAIN_EXIT_MS` の後に外される）。

**修正**（本番のみ。テストの期待・タイムアウト・待ち方は変えていない）:
- `motion.ts`: 止まった字の姿 `SETTLED_TRANSFORM`（恒等）を定数にした。`motion.test.ts` に、全部の入り方・周期 0/500/1300・先取り 0/200・字数 1/5/14・全部の字で、`entranceDone` 以後の `still` と減速表示（退場でない）の `glyphTransform` がこれと一致することを足した（期待の変更ではなく追加）。
- `GlyphLayer.tsx`: 層ごとに `useSettled` を 1 つ持つ。退場でない層は、減速表示なら最初から、`hold: 'still'` なら入りが終わった時点（`entranceDurationMs` をその時の周期で計り、時計が届いていなければタイマーを掛け直す）から「止まった」とみなし、字の `motion` は何も捕まえずに `SETTLED_TRANSFORM` を返す（書き込みも 1 回きりで、`transform` / `opacity` も走らない）。入りの錨・種類・字数が変われば時計を追い直す。`color` は移行する強調の字だけが `time` を捕まえ、`strokeWidth` は太い行の字だけが時計と拍を捕まえる。他の保持（`pulse` / `shake` / `breathe` / `drift`）と退場は今までどおり毎フレーム。
- `PlainBody.tsx`: 表示中の本文は、フェードインが終わったら（同じくタイマーで確かめて）時計を捕まえずに 1 を返す。

見た目は変わらない: 止まったと見なすのは `glyphTransform` / `plainBodyOpacity` の結果がすでに定数になった後だけ。1 つだけ理屈の上の違いがある: `scatter` の入りで `still` の層は、止まった後に拍の周期が伸びると、今までは字ずらしが伸びて着地済みの字が入りを一瞬やり直していた（不具合寄りの挙動）。今はそのまま止まっている。歌詞カード・時計・銘板・前後行・caption は `scatter` を使わないので、これが起き得るのはディレクターが `scatter` と `still` を組んだ同期行だけ。

**未検証**: 修正後のテストと typecheck は実行していない（エージェントのシェルはブロックされている）。呼び出し側で `npx jest src/typesetting/__tests__/LyricStage.test.tsx src/typesetting/__tests__/GlyphLayer.test.tsx src/typesetting/__tests__/motion.test.ts --watchman=false`、`npm test -- --watchman=false`、`npm run typecheck` を実行して結果をここに残す。まだ境目で落ちるなら、残る候補は申し送り (2)（jest の後片付けで残る前のテストの mapper。テスト側の事情）で、本番の無駄としてはもう歌詞カードの舞台に毎フレームの導出は残っていない（時計、帯域の追従、`TextureBackground` の質感だけ）。
