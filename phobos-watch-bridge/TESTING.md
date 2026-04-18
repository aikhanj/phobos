# Phobos Watch Bridge — First-Run Testing Walkthrough

_Created 2026-04-18 11:04 EDT_

Step-by-step process for taking the watch bridge from "just cloned" to "browser is receiving live BPM from the Apple Watch." Complements the README's high-level overview with concrete verification checkpoints at every layer, so if something breaks you know exactly which stage failed.

---

## Bug fixes applied in this pass

Before running, confirm these are present (they should be — listed for traceability):

1. **`WorkoutManager.swift`** — auth request now includes `HKObjectType.workoutType()` in `toShare`. Without this, `HKWorkoutSession.startActivity` silently fails ([PhobosWatchBridge Watch App/WorkoutManager.swift:24-32](PhobosWatchBridge%20Watch%20App/WorkoutManager.swift#L24-L32)).
2. **`PhobosWatchBridge.entitlements`** (new file) — declares `com.apple.developer.healthkit = true`. Required for the HealthKit auth prompt to appear on-device.
3. **`project.yml`** — wires the entitlements file via `CODE_SIGN_ENTITLEMENTS`.

If the Xcode project was regenerated with XcodeGen after these changes, everything is already in place. If not:

```
cd phobos-watch-bridge
xcodegen generate
```

Reference diffs used to validate the code:
- [nhathm/swift_heart_rate_real_time](https://github.com/nhathm/swift_heart_rate_real_time) — canonical `HKWorkoutSession + HKLiveWorkoutBuilder` pattern.
- [Apple SpeedySloth sample](https://developer.apple.com/documentation/healthkit/speedysloth_creating_a_workout) — authoritative auth pattern for workouts.
- [Stack Overflow: iPhone as BLE HR peripheral](https://stackoverflow.com/questions/18099081/add-heart-rate-measurement-service-to-iphone-as-peripheral) — canonical `CBPeripheralManager` + `0x180D`.

---

## One-time Xcode setup

Prereqs: paid Apple Developer account, iPhone + Apple Watch paired on the same Apple ID, iPhone USB cable.

1. Open `PhobosWatchBridge.xcodeproj`.
2. In the project navigator, click the blue project icon → **Signing & Capabilities** tab.
3. For **each** of the two targets (`PhobosWatchBridge` iOS, `PhobosWatchBridge Watch App` watchOS):
   - **Team**: select your paid developer team.
   - Confirm the bundle identifier is unique to your account. If Xcode flags a conflict, change both to `com.<yourname>.phobos.watchbridge` and `com.<yourname>.phobos.watchbridge.watchkitapp` (they must match the `WKCompanionAppBundleIdentifier` in the Watch app's Info.plist — if you change them, update that too).
   - Confirm capabilities:
     - iOS target: **Background Modes** → "Acts as a Bluetooth LE accessory" + "Uses Bluetooth LE accessories" should both be checked.
     - Watch target: **HealthKit** capability should be present.
4. Select your iPhone as the run destination. Wait for Xcode to finish "Preparing …" (can take 5-10 min on first connect — it's copying debug symbols).

## Physical testing flow

### Stage 1 — iOS app on iPhone

1. Scheme: `PhobosWatchBridge` → run (⌘R) to iPhone.
2. First launch: iOS prompts for **Bluetooth**. Tap Allow.
3. iPhone app UI should display:
   - **Bluetooth ready** → **Advertising as PHOBOS HR**
4. Xcode console filter `subsystem:com.phobos.watchbridge`:
   - ✅ `"Bluetooth ready"` then `"Advertising as PHOBOS HR"` — stage 1 passes.
   - ❌ `"Bluetooth permission denied"` — go to **Settings → Privacy & Security → Bluetooth** → enable for PHOBOS.
   - ❌ `"advertise error: …"` — read the error; most likely cause is another app already advertising the same service. Force-quit all other BLE apps.

### Stage 2 — Watch app on Apple Watch

1. Scheme: `PhobosWatchBridge Watch App` → run to the watch. **First install is slow (2-5 min).** Xcode shows "Installing … 0%" for a long time before anything happens — this is normal.
2. Launch PHOBOS from the Watch home screen.
3. First launch: watchOS prompts for **Health data access**. Tap **Turn On All**.
4. Tap **Start** button. Watch UI should show BPM updating within 5-10 seconds.
5. Xcode console (Watch device):
   - ✅ BPM log lines at ~1 Hz — stage 2 passes.
   - ❌ `"HealthKit auth denied"` — open Watch **Settings → Health → Data Access & Devices → PHOBOS** → enable.
   - ❌ `"Failed to start workout session: …"` — most commonly this means HealthKit entitlement is missing or `workoutType()` isn't in `toShare`. Both should be fixed in the latest code — regenerate with XcodeGen if you've forked.
   - ❌ No logs at all — Watch may not be reachable from Xcode. Unplug iPhone cable, reconnect, wait for "Preparing debugger support for Apple Watch" to finish.

### Stage 3 — Watch → iPhone handoff

1. With Watch running and Start tapped, iPhone app should begin updating `lastSentBPM` in its UI.
2. Xcode console (iPhone):
   - ✅ `didReceiveMessage` fires with a `bpm` value around every 1 second — stage 3 passes.
   - ❌ Nothing arrives — WatchConnectivity suspends when either app is backgrounded. Keep **both** apps foregrounded during testing. If still nothing, toggle airplane mode on the Watch once, then try again.

### Stage 4 — Browser discovery

1. Open Chrome (**not Safari** — Safari doesn't support Web Bluetooth).
2. Load the game dev server: `http://localhost:5173`.
3. On the title screen, click **Connect Heart Rate Monitor**.
4. Browser picker opens. `PHOBOS HR` should appear in the list.
   - ✅ Shows up — select it → stage 4 passes.
   - ❌ Not listed — iPhone must be foregrounded AND within ~10m (BLE range through walls is poor). Refresh and retry.

### Stage 5 — End-to-end verification

1. After selecting `PHOBOS HR`, the corner-box BPM readout should show a live number.
2. Put your finger on the Watch's crown — the heart sensor needs skin contact. BPM should settle into your actual heart rate (60-100 resting).
3. Jog in place for 20 seconds. BPM should rise. This confirms the whole pipeline is live (Watch sensor → HealthKit → WatchConnectivity → iPhone → BLE advertise → Web Bluetooth → game UI).

---

## Quick log-filtering cheat sheet

| Layer | Xcode Console filter | Look for |
|-------|---------------------|----------|
| Watch HealthKit | `WorkoutManager` | `beginCollection`, BPM values |
| Watch → iPhone | `WatchSessionManager` | `didReceiveMessage`, `isReachable` |
| iPhone BLE advertise | `BluetoothPeripheralManager` | `"Advertising as PHOBOS HR"`, subscribe events |
| Browser | Chrome DevTools Console | `bluetoothHr` status events |

---

## Known gotchas

- **iPhone must stay foregrounded during the demo.** `CBPeripheralManager` advertising is throttled hard when the iOS app backgrounds. Prop the phone awake and on the app; don't let it sleep.
- **Free personal team vs paid account.** A free Apple ID can sign this, but Xcode only provisions for 7 days — the build will silently stop launching on day 8. The paid account avoids this.
- **Watch and iPhone must be on the same Apple ID.** Otherwise `WCSession.isPaired` returns false and nothing hands off.
- **First HealthKit prompt is one-shot.** If you accidentally deny, iOS won't ask again — you have to go to Watch Settings → Health → Data Access & Devices and enable manually, or delete and reinstall the Watch app.
