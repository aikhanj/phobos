import Foundation
import WatchConnectivity

/// watchOS-side WatchConnectivity sender. Ships `["bpm": Int]` messages to the
/// paired iPhone — uses `sendMessage` if reachable (low latency), falls back to
/// `transferUserInfo` for guaranteed eventual delivery.
final class WatchSessionManager: NSObject, ObservableObject {

    @Published var isReachable: Bool = false
    @Published var isActivated: Bool = false

    override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func send(bpm: Int) {
        let payload: [String: Any] = ["bpm": bpm]
        let session = WCSession.default

        if session.activationState == .activated && session.isReachable {
            // Live path — delivered near-instantly while both apps are foregrounded.
            session.sendMessage(payload, replyHandler: nil) { [weak self] _ in
                // If realtime send fails for any reason, queue it for background delivery.
                self?.fallback(payload: payload)
            }
        } else {
            fallback(payload: payload)
        }
    }

    private func fallback(payload: [String: Any]) {
        // transferUserInfo is background-safe and guaranteed delivery when the
        // phone next comes online. It queues FIFO.
        WCSession.default.transferUserInfo(payload)
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
}
