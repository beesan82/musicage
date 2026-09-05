# MUSICAGE

レコードのそばに置き、周囲で鳴っている音に反応する縦型のビジュアルオブジェクトです。音楽を再生せず、マイク入力の音量メーターを端末内で表示用の特徴量に変換して、5つの映像世界を切り替えます。

## Prerequisites

- Node.js LTS
- App Store版のExpo Go（Expo SDK 57対応）を入れたiPhone
- Windows PC and the phone on the same Wi-Fi

## Run

1. `npm install`
2. `npm run start -- --lan`
3. Scan the QR code with Expo Go
4. Allow microphone access

LAN接続できない環境では、`npm run start:tunnel` を試してください。

## What it does

- 通常の表示は端末内のマイク音量メーターだけで動き、音楽を再生しません。
- 録音メーター用の一時ファイルは回転・停止時に削除し、音声を履歴として保存しません。
- 曲の識別を行う場合だけ、ユーザーが明示的に「曲を読み取る」を押して最大12秒の音をAudDへ直接送信します。通常の表示中に認識リクエストは送信しません。

## Real lyrics setup

1. AudDのアカウントを自分で作成してAPIトークンを取得します。トークンはこのリポジトリやチャットに追加しないでください。
2. PCとiPhoneを同じWi-Fiに接続して `npm run start -- --lan` を起動し、App Store版Expo GoでQRを読み取ります。アプリ内の「AudDキーを設定」を開き、iPhone上だけでトークンを入力します。
3. 通常の表示はローカルのままです。「曲を読み取る」を押したときだけ、最大12秒のクリップをAudDへ直接送信します。LRCLIBへ送るのは、認識できた曲のメタデータだけです。
4. 設定でトークンを削除すると、次回から認識は無効になります。

LRCLIBの歌詞提供は無料ですが、すべての曲に歌詞や同期データがあるわけではありません。見つからない場合、MUSICAGEは作り物の歌詞を出さず、その状態をそのまま表示します。

## Device validation

- Speak, clap, and play music nearby to verify motion response.
- Check Ambient and Jazz manually by temporarily injecting fixed VisualState values in development.
- Deny microphone access after reinstalling Expo Go to verify recovery copy.
- 認識は「曲を読み取る」を押すまで始まらないこと、トークンが画面に表示されないこと、削除後は再設定が必要になることをiPhoneで確認します。
