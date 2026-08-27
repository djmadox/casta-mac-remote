# Casta

A small Google TV remote for macOS. Casta finds TVs on the local network and pairs with the code shown on screen. Developer mode is not needed for normal use.

The interface is available in English and Swedish. Choose your language under **Settings → Language**.

## Features

- Directional pad, Home, Back, volume, power and input controls
- YouTube and Netflix shortcuts
- Text input from the Mac keyboard
- Current app and playback controls
- Full and compact remote-only window modes
- Local Wi-Fi connection with no cloud service
- Automatic reconnection after the first pairing
- Optional ADB mode for detailed media information

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4173`. You can also use the arrow keys, Enter, Escape and Space to control the remote.

## Connect your TV

1. Connect your Mac and Google TV to the same Wi-Fi network.
2. Select **Add device**, then **Find TV**.
3. Choose your TV and ask it to show a pairing code.
4. Enter the six-character code in Casta.

The pairing certificate is encrypted with macOS secure storage in the desktop app. It is reused when the TV or Mac restarts.

The **Advanced connection** section still supports ADB when you want richer media details or need to troubleshoot a device. ADB is included in packaged builds. During development, Casta also finds Android SDK Platform Tools installed by Android Studio, or a custom path set with `CASTA_ADB_PATH`.

All traffic stays between the Mac and TV on the local network.

## Build the Mac app

```bash
npm run dist
```

The build script prepares ADB for the optional advanced mode and creates `Casta.app` and a DMG installer in `dist/`.

## View modes

Open **Settings** to switch between the complete application window and **Remote only**. Compact mode shrinks Casta to a small remote window and remembers the selection for the next launch. Use the gear button in the upper-right corner to reopen settings.

## Distribution

Local builds are unsigned. Public distribution outside the Mac App Store requires an Apple Developer certificate and notarization.

## Remote protocol

Normal remote control uses the local Android TV Remote Service v2 protocol through [`@kud/androidtv-remote`](https://github.com/kud/androidtv-remote). The protocol is not an official public macOS SDK, so a future Google TV update could require a Casta update.
