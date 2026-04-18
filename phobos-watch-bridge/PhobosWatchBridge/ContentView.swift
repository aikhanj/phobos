import SwiftUI

struct ContentView: View {
    @EnvironmentObject var bluetooth: BluetoothPeripheralManager
    @EnvironmentObject var watch: WatchSessionManager

    var body: some View {
        VStack(spacing: 32) {
            Text("PHOBOS")
                .font(.system(size: 44, weight: .black, design: .monospaced))
                .kerning(4)
                .foregroundStyle(.red)

            Text("HR BRIDGE")
                .font(.system(size: 16, weight: .semibold, design: .monospaced))
                .kerning(2)
                .foregroundStyle(.secondary)

            Divider()

            VStack(spacing: 8) {
                Text("WATCH")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Text("\(watch.lastBPM) BPM")
                    .font(.system(size: 36, weight: .bold, design: .monospaced))
                    .foregroundStyle(watch.lastBPM > 0 ? .primary : .secondary)
                Text(watch.isReachable ? "reachable" : "waiting for watch")
                    .font(.caption.monospaced())
                    .foregroundStyle(watch.isReachable ? .green : .orange)
            }

            Divider()

            VStack(spacing: 8) {
                Text("BLUETOOTH")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Text(bluetooth.status)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(bluetooth.isAdvertising ? .green : .orange)
                Text(bluetooth.hasSubscriber ? "central subscribed" : "no subscriber")
                    .font(.caption.monospaced())
                    .foregroundStyle(bluetooth.hasSubscriber ? .green : .secondary)
            }

            Spacer()

            Text("Pair from the game:\n\"PHOBOS HR\" in Bluetooth picker")
                .multilineTextAlignment(.center)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
        .environmentObject(BluetoothPeripheralManager())
        .environmentObject(WatchSessionManager())
}
