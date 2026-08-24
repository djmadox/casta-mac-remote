# Casta

A Chromecast-inspired remote control for macOS. Casta uses a local Node bridge and Android Debug Bridge to send real remote commands to Chromecast with Google TV and Google TV Streamer devices.

The interface is available in English and Swedish. Choose your language under **Settings → Language**.

## Features

- Directional pad, Home, Back, volume, power and input controls
- YouTube and Netflix shortcuts
- Text input from the Mac keyboard
- Live media session status from the connected TV
- Full and compact remote-only window modes
- Local Wi-Fi connection with no cloud service

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4173`. You can also use the arrow keys, Enter, Escape and Space to control the remote.

## Connect your TV

1. Connect your Mac and Google TV to the same Wi-Fi network.
2. Enable developer mode by pressing **Android TV OS build** seven times under **Settings → System → About**.
3. Enable **Wireless debugging** under Developer options.
4. Select **Add device** in Casta and follow the pairing guide.

ADB is included in packaged builds. During development, Casta automatically finds Android SDK Platform Tools installed by Android Studio. You can also set a custom path with `CASTA_ADB_PATH`.

All traffic stays between the Mac and TV on the local network.

## Build the Mac app

```bash
npm run dist
```

The build script finds ADB from Android Studio and creates `Casta.app` and a DMG installer in `dist/`.

## View modes

Open **Settings** to switch between the complete application window and **Remote only**. Compact mode shrinks Casta to a small remote window and remembers the selection for the next launch. Use the gear button in the upper-right corner to reopen settings.

## Distribution

Local builds are unsigned. Public distribution outside the Mac App Store requires an Apple Developer certificate and notarization.
