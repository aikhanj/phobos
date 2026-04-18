import Foundation
import HealthKit

/// Starts an HKWorkoutSession + HKLiveWorkoutBuilder so HealthKit delivers
/// heart rate samples at ~1 Hz while the app is active. Each new HR sample
/// fires `onHeartRate` so the WatchConnectivity layer can forward it to the phone.
///
/// Without a workout session, HealthKit throttles HR to very low frequencies
/// (minutes apart). The workout session is the trick that unlocks real-time HR.
final class WorkoutManager: NSObject, ObservableObject {

    @Published var currentBPM: Int = 0
    @Published var isRunning: Bool = false

    /// Called on the main queue whenever a new HR sample is collected.
    var onHeartRate: ((Int) -> Void)?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private let hrType = HKQuantityType(.heartRate)

    func start() {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        // HKWorkoutSession requires write access to HKWorkoutType or startActivity
        // silently fails. Read HR; write workouts (we don't actually save any, but
        // the session needs the capability).
        let typesToShare: Set<HKSampleType> = [HKObjectType.workoutType()]
        let typesToRead: Set<HKObjectType> = [hrType, HKObjectType.workoutType()]
        healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead) { [weak self] granted, error in
            guard let self = self else { return }
            if let error = error {
                print("HealthKit auth error: \(error)")
                return
            }
            guard granted else {
                print("HealthKit auth denied")
                return
            }
            DispatchQueue.main.async {
                self.beginWorkout()
            }
        }
    }

    func stop() {
        session?.end()
        builder?.endCollection(withEnd: Date()) { _, _ in
            self.builder?.finishWorkout { _, _ in }
        }
        DispatchQueue.main.async {
            self.isRunning = false
        }
    }

    private func beginWorkout() {
        let config = HKWorkoutConfiguration()
        config.activityType = .other
        config.locationType = .indoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)

            session.delegate = self
            builder.delegate = self

            self.session = session
            self.builder = builder

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { [weak self] success, error in
                if let error = error {
                    print("beginCollection error: \(error)")
                }
                DispatchQueue.main.async {
                    self?.isRunning = success
                }
            }
        } catch {
            print("Failed to start workout session: \(error)")
        }
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession,
                        didChangeTo toState: HKWorkoutSessionState,
                        from fromState: HKWorkoutSessionState,
                        date: Date) {
        DispatchQueue.main.async {
            self.isRunning = (toState == .running)
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        print("workout session failed: \(error)")
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Events (pause/resume markers) — nothing to do.
    }

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                        didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType, quantityType == hrType else { continue }
            guard let stats = workoutBuilder.statistics(for: quantityType) else { continue }
            // Use the most recent value. `mostRecentQuantity` stays live during the workout.
            guard let quantity = stats.mostRecentQuantity() else { continue }
            let bpmUnit = HKUnit.count().unitDivided(by: .minute())
            let bpm = Int(quantity.doubleValue(for: bpmUnit).rounded())

            DispatchQueue.main.async {
                self.currentBPM = bpm
                self.onHeartRate?(bpm)
            }
        }
    }
}
