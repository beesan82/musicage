# MUSICAGE

レコードのそばに置き、周囲で鳴っている音に反応する縦型のビジュアルオブジェクトです。音楽を再生せず、マイク入力を端末内で即時に特徴量へ変換して、5つの映像世界を切り替えます。

## Prerequisites

- Node.js LTS
- Expo Go on an iPhone
- Windows PC and the phone on the same network, or use the tunnel command

## Run

1. `npm install`
2. `npm run start:tunnel`
3. Scan the QR code with Expo Go
4. Allow microphone access

If the tunnel cannot connect, put the Windows PC and iPhone on the same Wi-Fi and run `npm run start -- --lan` instead.

## What it does

- Uses live microphone PCM only to animate visuals.
- Does not record, store, upload, identify, or play audio.
- Shows local visual-copy text; it does not show recognized lyrics.

## Device validation

- Speak, clap, and play music nearby to verify motion response.
- Check Ambient and Jazz manually by temporarily injecting fixed VisualState values in development.
- Deny microphone access after reinstalling Expo Go to verify recovery copy.
