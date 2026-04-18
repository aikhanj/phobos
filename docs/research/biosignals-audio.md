# Biosignals & Audio — Open Source Options for Phobos

Created: 2026-04-18

Research on (1) open-source browser face/emotion detection, (2) how to pipe Apple Watch / Whoop / HR monitors into the game, and (3) free horror audio libraries.

---

## 1. Face / Emotion Detection (browser, open source)

### face-api.js — the best match for "are they scared"

Direct fit: its pretrained expression recognizer outputs probabilities for **`neutral`, `happy`, `sad`, `angry`, `fearful`, `disgusted`, `surprised`** — "fearful" is literally one of the classes ([face-api.js docs](https://justadudewhohacks.github.io/face-api.js/docs/index.html)). All inference runs in the browser on TensorFlow.js with pretrained weights, MIT-licensed.

- **Original repo (archived but widely used):** [justadudewhohacks/face-api.js](https://github.com/justadudewhohacks/face-api.js/)
- **Actively maintained fork (recommended for new projects):** [vladmandic/face-api](https://github.com/vladmandic/face-api) — same API, updated to newer TF.js, fixes memory leaks, adds rotation tracking and age/gender ([vladmandic/face-api](https://github.com/vladmandic/face-api)).
- **Example emotion app:** [louiejancevski/FacialEmotionDetector](https://github.com/louiejancevski/FacialEmotionDetector) — React + face-api, simple reference.
- **Walkthrough tutorial:** [webtips.dev guide](https://webtips.dev/how-to-easily-add-emotion-detection-to-your-app-with-face-api-js).

**How this would plug into Phobos:**
- Run the expression model every 500ms tick (already has the hook).
- Pull `expressions.fearful`, `expressions.surprised`, `expressions.disgusted` — sum/weight them into the `fear_score` the Scare Director already consumes.
- Blink rate, gaze aversion, and mouth-open can be derived from the landmark model (already installed — `@mediapipe/tasks-vision`) and combined with face-api's emotions for a richer signal.

### MediaPipe (already in the stack)

MediaPipe's Face Landmarker gives 478 3D landmarks + 52 blendshapes (jawOpen, browDownLeft, eyeBlinkLeft, mouthFrownLeft, etc.) ([Google AI Edge docs](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js)). It does **not** output a "fear" classification — but the blendshapes can be mapped manually:

- Fear proxy: `browInnerUp` (high) + `eyeWideLeft/Right` (high) + `mouthStretchLeft/Right` (high) + `jawOpen` (high).
- Surprise proxy: `browOuterUpLeft/Right` + `jawOpen`.

This is lower accuracy than face-api's trained classifier but zero added deps. Good Plan B if face-api's bundle size hurts.

### Recommendation

**Run both.** MediaPipe for landmarks/blendshapes/gaze (already loaded), face-api.js for the "fearful" softmax output. Combine into `fear_score`:

```
fear_score =
  0.50 * faceApi.fearful +
  0.20 * faceApi.surprised +
  0.15 * normalize(blinkRateDelta) +
  0.15 * normalize(hrIncreaseVsBaseline)
```

---

## 2. Heart Rate Monitors — how to connect them to a browser game

Short answer: the **only clean real-time path in a browser is Web Bluetooth + the standard BLE Heart Rate Service (`0x180D` / characteristic `0x2A37`)**. Anything that doesn't broadcast that profile needs a bridge.

### Web Bluetooth API — the foundation

- Available in Chrome, Edge, Opera on desktop/Android, and Safari on macOS 15 / iOS 16+ ([Chrome Developers](https://developer.chrome.com/docs/capabilities/bluetooth)).
- Requires HTTPS + a user gesture to trigger the device picker.
- Receives notifications when BPM changes (typically 1 Hz).
- The Heart Rate Measurement characteristic (`0x2A37`) returns uint8 or uint16 BPM at byte 1, depending on a flag at byte 0 ([pulse-overlay repo](https://github.com/religa/pulse-overlay)).

Drop-in reference projects:
- [megaconfidence/bt-heart-monitor](https://github.com/megaconfidence/bt-heart-monitor) — minimal vanilla JS client, MIT, ~100 LOC.
- [religa/pulse-overlay](https://github.com/religa/pulse-overlay) — Chrome extension that overlays live BPM on any page. Useful as a decoupled option if you don't want to add Web Bluetooth code to the game directly.
- Walkthrough with code: [Wellally's React + Web Bluetooth tutorial](https://www.wellally.tech/blog/build-real-time-heart-rate-dashboard-react-bluetooth).

### What works out of the box (broadcasts standard BLE HR service)

| Device | Works via Web Bluetooth? | Notes |
|---|---|---|
| Polar H9 / H10 chest strap | Yes | Industry standard, cheapest reliable option (~$80) |
| Wahoo Tickr / Tickr X | Yes | Chest strap, also broadcasts over ANT+ |
| Garmin HRM-Dual / HRM-Pro | Yes | Dual BLE + ANT+ |
| Coospo, Magene, Moofit straps | Yes | Budget options, all implement standard profile |
| Polar Verity Sense (arm band) | Yes | Optical, no chest strap |

**For the demo, a single Polar H10 or Wahoo Tickr is the lowest-risk bet.**

### Apple Watch — does NOT broadcast standard BLE HR (by default)

Apple Watch hardware supports HR over BLE, but watchOS does not expose it as the standard GATT Heart Rate Service. HealthKit is local-only — "not a cloud service, it's a local data store on each user's phone" ([Momentum.ai blog](https://www.themomentum.ai/blog/what-you-can-and-cant-do-with-apple-healthkit-data)). Passive HealthKit queries only deliver new samples after sync, adding latency ([Apple Developer Forums](https://developer.apple.com/forums/thread/756354)).

**Option A — Ship a custom watchOS app (recommended, since you're an Apple developer):**

This is the cleanest path. You own the full pipeline, get ~1 Hz real-time HR, and the game code path is identical to a Polar strap.

1. **watchOS app** starts an `HKWorkoutSession` and `HKLiveWorkoutBuilder`. Workout sessions unlock high-frequency `heartRate` quantity updates via `HKAnchoredObjectQuery` (delivered every ~1s while the session is active) ([Apple — heartRate identifier](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartrate); [Display Heart Rate with HealthKit on WatchOS](https://medium.com/display-and-use-heart-rate-with-healthkit-on/display-and-use-heart-rate-with-healthkit-on-swiftui-for-watchos-2b26e29dc566)).
2. **Watch -> iPhone** via `WatchConnectivity` (`WCSession.sendMessage` for low-latency, or `transferUserInfo` / `updateApplicationContext`). Sub-second delivery over BT.
3. **iPhone rebroadcasts as standard BLE HR Service** using `CoreBluetooth` in peripheral role. Advertise service `0x180D`, characteristic `0x2A37` with notify. The game's Web Bluetooth code pairs with it just like a Polar strap — zero game-side changes.
4. **Required entitlements/plist keys:** `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`, `NSBluetoothAlwaysUsageDescription`, `WKBackgroundModes` (workout-processing), `UIBackgroundModes` (bluetooth-peripheral). Signing with a paid Apple Developer account enables device install.

End-to-end latency should be **under 1 second** watch -> browser. Good enough for scare tuning, nearly good enough for jumpscare timing.

**Option B — Use an existing bridge app (if you don't want to build):**

- [HeartCast on the App Store](https://apps.apple.com/us/app/heartcast-heart-rate-monitor/id1499771124) — does exactly Option A's Step 3 on a prebuilt app. 1-3s latency. No code required.
- Similar: HRV Broadcast, BLE HeartRate, PulsedIn.

**Given you're an Apple dev, Option A is strictly better** — same pairing flow in the game, tighter latency, a demo-friendly custom UI on the watch (e.g., "PHOBOS" branding + live BPM), and no dependency on a third-party app staying available. Budget half a day for Options A.

### Whoop — API only, ~1 min granularity, NOT real-time enough

Whoop does not broadcast standard BLE HR. The only access is their Developer Platform:

- [WHOOP Developer Platform](https://developer.whoop.com/) — OAuth 2.0, webhooks notify when new data is available ([WHOOP API Docs](https://developer.whoop.com/api/)).
- Heart rate resolution is **1-minute intervals** ([WHOOP API Docs](https://developer.whoop.com/api/)).
- Access is free but requires a Whoop membership ([Support](https://support.whoop.com/s/article/The-WHOOP-Developer-Platform?language=en_US)).
- v1 webhooks removed — must use v2 ([v1 to v2 Migration Guide](https://developer.whoop.com/docs/developing/v1-v2-migration/)).

**Verdict: Whoop is unusable for the game's real-time fear loop.** 1 Hz is the minimum useful cadence; 1/60 Hz means the player's HR spike after a scare will show up a full minute later.

### Fallback that's already in the plan: rPPG (webcam heart rate)

If no hardware is available, Phase 2 of Phobos already calls for green-channel FFT on a cheek ROI from the webcam. Accuracy is ~5-10 BPM RMSE in good lighting — usable as a fear signal, less so as a medical number. This stays the default; BLE HR becomes an optional "plug in your strap for accurate HR" upgrade.

### Recommendation for the hackathon

1. **Default path:** webcam rPPG (Phase 2 plan, no hardware required — judges can walk up and play).
2. **Optional plug-in:** Web Bluetooth + BLE HR service. Show a "Connect Heart Rate Monitor" button on the title screen. Budget 2-3 hours to add.
3. **Demo hardware to bring:** one Polar H10 or Wahoo Tickr. If a judge owns an Apple Watch, install HeartCast on their phone (or yours) in 60 seconds and pair.
4. **Skip Whoop.** 1-minute resolution doesn't fit a real-time horror loop.

---

## 3. Free Horror Audio Libraries

Ranked by practical fit for the game.

### Freesound.org — the first stop

Huge collaborative database, Creative Commons licenses, very niche horror content ([Freesound packs for horror ambience by klankbeeld](https://freesound.org/people/klankbeeld/packs/9250/); [Creepy Horror Ambient Drone by Audio_Dread](https://freesound.org/people/Audio_Dread/sounds/555179/)). Filter by license to CC0 or CC-BY to simplify attribution. Has an API if you want to pull samples programmatically.

### Zapsplat — Horror Drones Pack

27 pro-quality horror atmospheres, mp3 + wav, free tier allows commercial use with attribution ([Zapsplat horror drones pack](https://www.zapsplat.com/sound-effect-packs/horror-drones/)). Single sign-up, then bulk download. This is the most hackathon-friendly bundle — one pack covers ambient beds for all three scenes.

### Mixkit

31 free horror SFX under the Mixkit license (no attribution required, commercial use OK) ([Mixkit horror SFX](https://mixkit.co/free-sound-effects/horror/)). Smaller catalog but fast — no signup.

### SONNISS — Horror Drones (loopable)

50 loopable 2-minute horror drones, high-quality WAV/OGG ([SONNISS horror drones](https://sonniss.com/sound-effects/horror-drones/)). "Loopable" matters for the Audio Director — it can crossfade these indefinitely without seams. Also check SONNISS' free GDC Game Audio Bundle (hundreds of GB, royalty-free).

### Free-Stock-Music — Spooky Ambience (CC0)

CC0 (public domain, no attribution) spooky ambience track ([Free-Stock-Music Spooky Ambience](https://www.free-stock-music.com/sound-effects-library-spooky-ambience.html)). Simplest license, zero friction.

### Roundup reference

[12 Top Sources for Free Horror Sound Effects in 2025 — SFX Engine](https://sfxengine.com/blog/free-horror-sound-effects) — curated list covering the above plus smaller libraries.

### Suggested audio palette for Phobos (Phase 3 layered mixer)

| Layer | Purpose | Source |
|---|---|---|
| Ambient bed (loopable) | Per-scene atmosphere — basement damp, bedroom hush, attic wind | SONNISS loopable drones |
| Tonal drone (fear-reactive) | Rises in pitch/volume as fear_score climbs | Freesound CC0 drones |
| Random distant hits | Infrequent creaks, thuds, whispers | Zapsplat horror pack |
| Jumpscare stings | Triggered by Scare Director | Mixkit horror SFX |
| Creature vocalizations | Breathing, footsteps | Freesound CC-BY, or ElevenLabs for Phase 5 |

---

## Summary / action items

- **Face:** add [vladmandic/face-api](https://github.com/vladmandic/face-api) in Phase 2 alongside the existing MediaPipe landmarker. It has a `fearful` class out of the box.
- **Heart rate:** stick with rPPG as the default in Phase 2. Add an optional Web Bluetooth button using [megaconfidence/bt-heart-monitor](https://github.com/megaconfidence/bt-heart-monitor) as a reference. Bring a Polar H10 or Wahoo Tickr to the demo. Skip Whoop entirely.
- **Apple Watch:** since you're an Apple developer, ship a custom watchOS + iOS app pair. Watch uses `HKWorkoutSession` for ~1 Hz HR, forwards via `WatchConnectivity`, iPhone advertises standard BLE HR Service via `CoreBluetooth` peripheral. Game sees it as a normal chest strap. ~0.5-1s end-to-end. Budget half a day. Fallback: use [HeartCast](https://apps.apple.com/us/app/heartcast-heart-rate-monitor/id1499771124) if time runs short.
- **Audio:** download the Zapsplat Horror Drones pack + a SONNISS loopable drone set + a handful of Mixkit stings before the hackathon. That's enough material for all three scenes.
