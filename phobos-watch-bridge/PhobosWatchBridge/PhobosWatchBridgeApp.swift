import SwiftUI

@main
struct PhobosWatchBridgeApp: App {
    // Long-lived managers. @StateObject ensures they survive view rebuilds.
    @StateObject private var bluetooth = BluetoothPeripheralManager()
    @StateObject private var watch = WatchSessionManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(bluetooth)
                .environmentObject(watch)
                .onAppear {
                    // Wire the watch → BLE pipeline: every BPM received from the
                    // watch gets pushed out to the subscribed BLE central.
                    watch.onBPM = { [weak bluetooth] bpm in
                        bluetooth?.update(bpm: bpm)
                    }
                    watch.activate()
                    bluetooth.start()
                }
        }
    }
}
