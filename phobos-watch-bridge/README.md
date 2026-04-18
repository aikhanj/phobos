# Phobos Watch Bridge

A ready-to-run two-target Apple app that turns an Apple Watch into a **standard BLE Heart Rate Monitor** (same GATT profile as a Polar strap), readable by Web Bluetooth.

- **watchOS target** — reads HR via `HKWorkoutSession` + `HKLiveWorkoutBuilder` (~1 Hz), sends samples to the iPhone via `WatchConnectivity`.
- **iOS target** — re-broadcasts those samples as a CoreBluetooth peripheral advertising Heart Rate Service `0x180D` with characteristic `0x2A37`.

The Phobos browser game pairs with your iPhone exactly like it would with a Polar strap.

---

## Prerequisites

1. Xcode 15 or later.
2. An Apple Developer account (free personal team works for on-device installs with 7-day signing).
3. An iPhone + Apple Watch paired on the same Apple ID.
4. A USB cable for the iPhone.

---

## Open and run

The Xcode project is already generated.

1. Open `phobos-watch-bridge/PhobosWatchBridge.xcodeproj` in Xcode.
2. Select the project in the navigator, then for **each** target (`PhobosWatchBridge` and `PhobosWatchBridge Watch App`):
   - **Signing & Capabilities → Team**: pick your team.
   - If Xcode complains about a duplicate bundle ID, change both bundle IDs to `com.<yourname>.phobos.watchbridge` / `com.<yourname>.phobos.watchbridge.watchkitapp`.
3. Scheme `PhobosWatchBridge` → destination: your iPhone → **Run** (⌘R).
4. Scheme `PhobosWatchBridge Watch App` → destination: your Watch → **Run**. (First install is 2–5 min.)
5. On iPhone: **Settings → General → VPN & Device Management** → trust your developer profile.

The project ships with the right capabilities and Info.plist keys already configured: HealthKit on the watch target, Background Modes (Bluetooth peripheral + central) on the iOS target, and all Bluetooth/HealthKit usage strings.

### If you want to regenerate the project

Project is defined in `project.yml` (XcodeGen format). To regenerate:

```
brew install xcodegen   # once
cd phobos-watch-bridge
xcodegen generate
```

---

## Runtime

1. Open **PHOBOS** on iPhone → allow Bluetooth permission. UI shows `Advertising as PHOBOS HR`.
2. Open **PHOBOS** on Watch → allow HealthKit permission → tap **Start**. A workout session begins.
3. BPM appears on both screens within a few seconds.

---

## Pair with the game

1. In the Phobos web game title screen, click **Connect Heart Rate Monitor**.
2. The browser picker lists `PHOBOS HR` — select it.
3. The fear meter and BPM readout in the game's corner box start updating from the watch.

Browser support: Chrome, Edge, Opera on macOS/Windows/Android. **Safari does not support Web Bluetooth** — use Chrome for the demo.

---

## Troubleshooting

- **HR shows 0 on watch**: tap **Start** to begin the workout session. Verify HealthKit permission at Watch **Settings → Privacy → Health**.
- **`PHOBOS HR` missing from the browser picker**: confirm the iOS app is foregrounded, Bluetooth is on, and the Background Modes "Acts as a Bluetooth LE accessory" is enabled in the target's Signing & Capabilities.
- **Watch BPM isn't reaching the iPhone**: WatchConnectivity drops when the phone app is suspended. Bring the phone app to the foreground. Toggle airplane mode on the watch once if state seems stuck.
- **iOS permission prompt didn't appear**: delete the app from the iPhone home screen, then reinstall from Xcode.
- **"HealthKit entitlement required"**: the watch target's HealthKit capability isn't enabled. Re-run `xcodegen generate`, or add it manually under Signing & Capabilities.
- **Choppy BPM**: `HKLiveWorkoutBuilder` delivers samples at ~1 Hz; the game's 500 ms biosignal tick smooths them.

---

## How it works

```
┌─────────────┐  HKLiveWorkoutBuilder   ┌─────────────┐  WatchConnectivity   ┌─────────────┐  CoreBluetooth peripheral  ┌─────────────┐
│ Apple Watch │ ──── @ ~1Hz HR ──────→ │  watchOS    │ ─── sendMessage ──→ │   iOS app   │ ── advertises 0x180D ────→ │   Browser   │
│   sensor    │                        │     app     │                     │             │    notify 0x2A37            │ (Web BT)    │
└─────────────┘                        └─────────────┘                     └─────────────┘                             └─────────────┘
```

- HR Measurement payload uses the uint8 form: `[0x00, bpm]`. See `BluetoothPeripheralManager.swift:58`.
- Transmit queue overflow is handled via `peripheralManagerIsReady(toUpdateSubscribers:)`.
- WatchConnectivity uses `sendMessage` (live) with `transferUserInfo` as background fallback.

---

## Why this exists (instead of using an existing GitHub repo)

Searched GitHub for an open-source Apple Watch → BLE HR bridge. Closest matches:

- [coolioxlr/watchOS-2-heartrate](https://github.com/coolioxlr/watchOS-2-heartrate) — only reads HR on-watch, no BLE broadcast. Last updated 2016.
- [thomaspaulmann/HeartControl](https://github.com/thomaspaulmann/HeartControl) — continuous HR monitoring, no broadcast. watchOS 3 era.
- [cagnulein/qdomyos-zwift](https://github.com/cagnulein/qdomyos-zwift) (777★) — the most popular OSS fitness-bridge project, contains HR broadcast buried in a huge indoor-cycling app. Too heavyweight to extract cleanly.
- [HeartCast](https://apps.apple.com/us/app/heartcast-heart-rate-monitor/id1499771124) — does exactly this, but closed-source (App Store).

No turnkey open-source version exists for the watchOS + iOS + BLE peripheral combo. This app is that missing piece, kept minimal (~800 LOC across 11 files).
