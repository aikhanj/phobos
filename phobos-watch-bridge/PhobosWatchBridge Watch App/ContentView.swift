import SwiftUI

struct ContentView: View {
    @EnvironmentObject var workout: WorkoutManager
    @EnvironmentObject var session: WatchSessionManager

    var body: some View {
        VStack(spacing: 10) {
            Text("PHOBOS")
                .font(.system(size: 18, weight: .black, design: .monospaced))
                .kerning(2)
                .foregroundStyle(.red)

            Text("\(workout.currentBPM)")
                .font(.system(size: 54, weight: .bold, design: .rounded))
                .foregroundStyle(workout.isRunning ? .primary : .secondary)
                .contentTransition(.numericText())

            Text("BPM")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(.secondary)

            if workout.isRunning {
                Button(action: workout.stop) {
                    Text("Stop")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                }
                .tint(.red)
            } else {
                Button(action: workout.start) {
                    Text("Start")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                }
                .tint(.red)
            }

            Text(session.isReachable ? "phone reachable" : "phone not reachable")
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(session.isReachable ? .green : .orange)
        }
        .padding(.horizontal, 8)
    }
}

#Preview {
    ContentView()
        .environmentObject(WorkoutManager())
        .environmentObject(WatchSessionManager())
}
