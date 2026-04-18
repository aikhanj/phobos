import Foundation
import CoreBluetooth

/// Acts as a BLE peripheral advertising the standard Heart Rate Service (0x180D)
/// with a Heart Rate Measurement characteristic (0x2A37). A Web Bluetooth client
/// (or any GATT central) can connect and subscribe for notifications.
///
/// Why this exists: Apple Watch doesn't expose its HR sensor as a BLE peripheral.
/// We relay values from the watch (via WatchConnectivity) into this peripheral so
/// the game sees "just another HR monitor" — no proprietary integration needed.
final class BluetoothPeripheralManager: NSObject, ObservableObject {

    // Standard GATT assigned numbers.
    private static let heartRateServiceUUID = CBUUID(string: "180D")
    private static let heartRateMeasurementCharUUID = CBUUID(string: "2A37")

    @Published var status: String = "initializing…"
    @Published var isAdvertising: Bool = false
    @Published var hasSubscriber: Bool = false
    @Published var lastSentBPM: Int = 0

    private var peripheralManager: CBPeripheralManager!
    private var hrCharacteristic: CBMutableCharacteristic!
    private var subscribedCentrals: [CBCentral] = []

    // Cache the most recent BPM so we can send it the moment a central subscribes.
    private var cachedBPM: UInt8 = 0

    override init() {
        super.init()
    }

    /// Kicks off the CBPeripheralManager. Advertising begins once state == .poweredOn.
    func start() {
        // Passing the main queue keeps delegate callbacks on the main actor so we
        // can touch @Published state without dispatching.
        peripheralManager = CBPeripheralManager(delegate: self, queue: .main, options: nil)
    }

    /// Called by the WatchConnectivity layer whenever a new BPM arrives.
    func update(bpm: Int) {
        let clamped = UInt8(max(0, min(255, bpm)))
        cachedBPM = clamped
        DispatchQueue.main.async { self.lastSentBPM = Int(clamped) }
        notifySubscribers(bpm: clamped)
    }

    // MARK: - HR Measurement encoding
    //
    // Heart Rate Measurement characteristic (0x2A37) payload:
    //   byte 0: flags
    //     bit 0 = HR format (0 = uint8 at byte 1; 1 = uint16 LE at bytes 1-2)
    //     other bits = sensor contact, energy expended, RR interval (all off here)
    //   byte 1..: HR value(s)
    //
    // We use the uint8 form because no human HR exceeds 255 BPM.
    // Example: 72 BPM → [0x00, 0x48].
    private func encode(bpm: UInt8) -> Data {
        return Data([0x00, bpm])
    }

    private func notifySubscribers(bpm: UInt8) {
        guard let char = hrCharacteristic, !subscribedCentrals.isEmpty else { return }
        let data = encode(bpm: bpm)
        // If updateValue returns false, the system's transmit queue is full — we'll
        // resend when peripheralManagerIsReady(toUpdateSubscribers:) fires.
        _ = peripheralManager.updateValue(data, for: char, onSubscribedCentrals: subscribedCentrals)
    }

    private func buildServiceAndAdvertise() {
        // "notify" = central can subscribe; "read" = central can pull on demand.
        // .readable permission is required alongside .notifiable to satisfy some stacks.
        hrCharacteristic = CBMutableCharacteristic(
            type: Self.heartRateMeasurementCharUUID,
            properties: [.notify, .read],
            value: nil,
            permissions: [.readable]
        )

        let service = CBMutableService(type: Self.heartRateServiceUUID, primary: true)
        service.characteristics = [hrCharacteristic]
        peripheralManager.add(service)

        let advertisement: [String: Any] = [
            CBAdvertisementDataServiceUUIDsKey: [Self.heartRateServiceUUID],
            CBAdvertisementDataLocalNameKey: "PHOBOS HR"
        ]
        peripheralManager.startAdvertising(advertisement)
    }
}

extension BluetoothPeripheralManager: CBPeripheralManagerDelegate {

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            status = "Bluetooth ready"
            buildServiceAndAdvertise()
        case .poweredOff:
            status = "Bluetooth off"
            isAdvertising = false
        case .unauthorized:
            status = "Bluetooth permission denied"
        case .unsupported:
            status = "Bluetooth LE unsupported"
        case .resetting:
            status = "Bluetooth resetting…"
        case .unknown:
            status = "Bluetooth state unknown"
        @unknown default:
            status = "Bluetooth unknown state"
        }
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error = error {
            status = "advertise error: \(error.localizedDescription)"
            isAdvertising = false
        } else {
            status = "Advertising as PHOBOS HR"
            isAdvertising = true
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                           central: CBCentral,
                           didSubscribeTo characteristic: CBCharacteristic) {
        if !subscribedCentrals.contains(where: { $0.identifier == central.identifier }) {
            subscribedCentrals.append(central)
        }
        hasSubscriber = true
        // Flush the cached value so the game sees a number immediately.
        if cachedBPM > 0 {
            notifySubscribers(bpm: cachedBPM)
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                           central: CBCentral,
                           didUnsubscribeFrom characteristic: CBCharacteristic) {
        subscribedCentrals.removeAll { $0.identifier == central.identifier }
        hasSubscriber = !subscribedCentrals.isEmpty
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        // Serve reads with the current cached value (uint8 form).
        if request.characteristic.uuid == Self.heartRateMeasurementCharUUID {
            request.value = encode(bpm: cachedBPM)
            peripheral.respond(to: request, withResult: .success)
        } else {
            peripheral.respond(to: request, withResult: .attributeNotFound)
        }
    }

    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        // Transmit queue drained — push the latest value again if we have one.
        if cachedBPM > 0 {
            notifySubscribers(bpm: cachedBPM)
        }
    }
}
