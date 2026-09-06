# MUSICAGE ShazamKit 歌詞同期設計

## 目的

周囲で再生されている音楽をiPhoneのマイクで認識し、認識時点の楽曲位置を基準に、LRCLIBの時刻付き歌詞を表示する。Expo Goではなく、ShazamKitを含むiPhone専用Development Buildを使用する。

## 採用方針

ShazamKitを薄いSwift製Expo Moduleとして組み込む。AudD Standardの`timecode`を録音クリップ内の位置として推測する処理、録音中央をアンカーにする処理、歌詞を均等割りする処理は同期経路から除外する。

対象OSはiPhoneのみとする。開発環境はWindows、iOSネイティブビルドはEAS Cloudを前提とし、Macは必須要件にしない。

## データフロー

```text
iPhone microphone
  -> ShazamKit / SHSession
  -> ExpoShazamKitModule
  -> React Native recognition state
  -> LRCLIB synced lyrics
  -> lyric sync clock and visual presentation
```

ShazamKitの認識結果から、曲情報、認識時刻の単調時計、認識時点に対応する楽曲位置を受け取る。通信レスポンスの到着時刻は楽曲位置の基準にしない。

## データ契約

```ts
type ShazamRecognition = {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  matchedAtMonotonicMs: number;
  currentOffsetMs: number;
};

type SyncedLyricLine = {
  timeMs: number;
  text: string;
};
```

ネイティブモジュールからJSへ、マイク音声、トークン、rawレスポンスは返さない。LRCLIBでは時刻付き歌詞を優先し、時刻付きデータがない場合は同期表示として扱わない。

## 同期時計

認識結果を受け取った時点で、次のアンカーを保存する。

```text
currentSongPositionMs =
  recognition.currentOffsetMs
  + (performance.now() - recognition.matchedAtMonotonicMs)
```

Reactのタイマーは画面更新用にのみ使用し、経過時間を加算して時計を作らない。再認識時は新しいShazamKit結果を新しいアンカーとして採用する。補正係数、固定バイアス、PLL、Kalman filterは初版の対象外とする。

## 画面状態

- 待機中：`曲を読み取る`
- 認識中：`聴き取り中…`
- 認識成功：曲名、アーティスト、同期歌詞を表示
- 認識失敗：理由と`もう一度試す`を表示

認識失敗、マイク権限拒否、LRCLIBに同期歌詞がない場合もビジュアライザは継続する。同期歌詞がない場合は通常歌詞を表示できるが、同期中と表示しない。

## ファイル構成

```text
modules/expo-shazamkit/
  ios/ExpoShazamKitModule.swift
  src/ExpoShazamKit.ts

src/recognition/
  shazamRecognition.ts
  lyricSync.ts
  lyricSync.test.ts

src/components/
  LyricTypography.tsx
  LyricTypography.test.tsx
```

既存のビジュアライザは変更しない。既存AudDコードは、ShazamKit移行に必要な認識経路の整理に限定して扱う。

## テスト受け入れ条件

1. ShazamKit認識成功時に曲情報と`currentOffsetMs`を受け取れる。
2. 認識失敗時に失敗状態と再試行導線になる。
3. `performance.now()`の差分で楽曲位置が進む。
4. 再認識時にアンカーが更新される。
5. LRC時刻に従って表示行が切り替わる。
6. 時刻なし歌詞は同期表示にならない。
7. マイク権限拒否を表示できる。
8. AudDの旧timecode、録音中央、歌詞均等割りが同期経路で使われない。

## 非対象

- Android対応
- 音楽再生機能
- 音声ファイルの保存
- 中継サーバー
- バックグラウンド認識
- 自動キャリブレーション
- 歌詞の手動時刻補正
- 歌詞データの別バージョン照合

## 前提と懸念

ShazamKitの楽曲位置が正しくても、LRCLIBの歌詞が別録音・別編集版なら歌詞はずれる可能性がある。初版では、認識精度と歌詞版の一致を実機で確認し、別音源版の自動照合は別タスクとする。

EASでiOS Development Buildを作るにはApple Developerの署名設定が必要になる。Swiftモジュールのコンパイル失敗時は、Windows上で直接Xcodeデバッグできないため、EASビルドログを使って修正する。
