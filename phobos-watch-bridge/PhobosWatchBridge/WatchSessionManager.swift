import Foundation
import WatchConnectivity

/// iOS-side WatchConnectivity receiver. The watch sends `["bpm": Int]` messages;
/// we surface them via `onBPM` so the BluetoothPeripheralManager can re-broadcast.
final class WatchSessionManager: NSObject, ObservableObject {

    @Published var lastBPM: Int = 0
    @Published var isReachable: Bool = false
    @Published var isActivated: Bool = false

    /// Callback wired by the App on launch. Kept as a plain closure so the
    /// BluetoothPeripheralManager doesn't need to be imported here.
    var onBPM: ((Int) -> Void)?

    override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    private func handle(bpm: Int) {
        DispatchQueue.main.async {
            self.lastBPM = bpm
            self.onBPM?(bpm)
        }
    }
}

extension WatchSessionManager: WCSessionDelegate {

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        DispatchQueue.main.async {
            self.isActivated = (activationState == .activated)
            self.isReachable = session.isReachable
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }

    // Required on iOS — the session can deactivate if the user switches watches.
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        // Reactivate so we keep receiving messages if a new watch pairs.
        WCSession.default.activate()
    }

    // Live messages (watch app is foregrounded / reachable).
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let bpm = message["bpm"] as? Int {
            handle(bpm: bpm)
        }
    }

    // Fallback path — watch queued the sample because the phone wasn't reachable.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let bpm = userInfo["bpm"] as? Int {
            handle(bpm: bpm)
        }
    }
}
