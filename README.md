# MUSICAGE

レコードのそばに置き、周囲で鳴っている音に反応する縦型のビジュアルオブジェクトです。音楽を再生せず、マイク入力の音量メーターを端末内で表示用の特徴量に変換して、5つの映像世界を切り替えます。

## Prerequisites

- Node.js LTS
- App Store版のExpo Go（Expo SDK 54対応）を入れたiPhone
- Windows PC and the phone on the same network, or use the tunnel command

## Run

1. `npm install`
2. `npm run start:tunnel`
3. Scan the QR code with Expo Go
4. Allow microphone access

If the tunnel cannot connect, put the Windows PC and iPhone on the same Wi-Fi and run `npm run start -- --lan` instead.

## What it does

- 通常の表示は端末内のマイク音量メーターだけで動き、音楽を再生しません。
- 録音メーター用の一時ファイルは回転・停止時に削除し、音声を履歴として保存しません。
- 曲の識別を行う場合だけ、ユーザーが明示的に「曲を読み取る」を押して最大12秒の音をAudDへ直接送信します。通常の表示中に認識リクエストは送信しません。

## Device validation

- Speak, clap, and play music nearby to verify motion response.
- Check Ambient and Jazz manually by temporarily injecting fixed VisualState values in development.
- Deny microphone access after reinstalling Expo Go to verify recovery copy.
