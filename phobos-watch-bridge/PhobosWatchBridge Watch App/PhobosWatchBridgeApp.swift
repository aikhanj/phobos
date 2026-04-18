import SwiftUI

@main
struct PhobosWatchBridge_Watch_AppApp: App {
    @StateObject private var workout = WorkoutManager()
    @StateObject private var session = WatchSessionManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(workout)
                .environmentObject(session)
                .onAppear {
                    // Wire: every new HR sample from HealthKit → push to iPhone.
                    workout.onHeartRate = { [weak session] bpm in
                        session?.send(bpm: bpm)
                    }
                    session.activate()
                }
        }
    }
}
