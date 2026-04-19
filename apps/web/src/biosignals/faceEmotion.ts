import * as faceapi from '@vladmandic/face-api';

export interface FaceExpressionSnapshot {
  // Probabilities 0-1 from face-api's expression recognizer
  neutral: number;
  happy: number;
  sad: number;
  angry: number;
  fearful: number;
  disgusted: number;
  surprised: number;
  // true if a face was detected on the most recent tick
  detected: boolean;
  // Last successful inference timestamp
  timestamp: number;
}

const MODEL_URL = '/models';

const EMPTY: FaceExpressionSnapshot = {
  neutral: 0,
  happy: 0,
  sad: 0,
  angry: 0,
  fearful: 0,
  disgusted: 0,
  surprised: 0,
  detected: false,
  timestamp: 0,
};

export class FaceEmotionDetector {
  private video: HTMLVideoElement | null = null;
  private ready = false;
  private inflight = false;
  private latest: FaceExpressionSnapshot = { ...EMPTY };
  // Larger inputSize + lower threshold: face-api's TinyFaceDetector is
  // brittle at 224/0.4 on 320x240 webcam feeds — a face in low light or
  // slightly off-center fails silently. 320/0.3 catches many more frames
  // at modest CPU cost. The "detected" flag gates fear_score, so more
  // true-positives means the AI actually reads the player.
  private detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.3,
  });

  onDiagnostic: ((msg: string) => void) | null = null;
  private warnedNotReady = false;
  private tickCount = 0;

  async init(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    ]);
    this.ready = true;
  }

  // Called from the 500ms biosignal tick. Non-blocking: if previous inference
  // is still running we drop this frame rather than queueing up backlog.
  tick(): void {
    if (!this.ready || !this.video || this.inflight) return;
    if (this.video.readyState < 2) {
      if (!this.warnedNotReady) {
        console.warn('[faceEmotion] video readyState < 2, skipping', {
          readyState: this.video.readyState,
          videoWidth: this.video.videoWidth,
          videoHeight: this.video.videoHeight,
        });
        this.warnedNotReady = true;
      }
      return;
    }
    this.inflight = true;
    this.runDetection().finally(() => {
      this.inflight = false;
    });
  }

  get snapshot(): FaceExpressionSnapshot {
    return this.latest;
  }

  dispose(): void {
    this.video = null;
    this.ready = false;
  }

  private async runDetection(): Promise<void> {
    if (!this.video) return;
    try {
      const result = await faceapi
        .detectSingleFace(this.video, this.detectorOptions)
        .withFaceLandmarks(true)
        .withFaceExpressions();

      this.tickCount += 1;

      if (!result) {
        this.latest = { ...EMPTY, detected: false, timestamp: Date.now() };
        if (this.tickCount <= 6 || this.tickCount % 20 === 0) {
          console.log('[faceEmotion] tick', this.tickCount, 'no face detected', {
            videoWidth: this.video.videoWidth,
            videoHeight: this.video.videoHeight,
          });
          this.onDiagnostic?.(`no face (tick ${this.tickCount})`);
        }
        return;
      }

      const e = result.expressions;
      this.latest = {
        neutral: e.neutral,
        happy: e.happy,
        sad: e.sad,
        angry: e.angry,
        fearful: e.fearful,
        disgusted: e.disgusted,
        surprised: e.surprised,
        detected: true,
        timestamp: Date.now(),
      };
      if (this.tickCount <= 3 || this.tickCount % 20 === 0) {
        const top = (Object.entries(e) as [string, number][])
          .sort((a, b) => b[1] - a[1])[0];
        console.log('[faceEmotion] tick', this.tickCount, 'face detected', {
          top: `${top[0]}=${top[1].toFixed(2)}`,
          fearful: e.fearful.toFixed(2),
          surprised: e.surprised.toFixed(2),
        });
        this.onDiagnostic?.(`face: ${top[0]} ${(top[1] * 100).toFixed(0)}%`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[faceEmotion] detection error', err);
      this.onDiagnostic?.(`face-api error: ${msg}`);
    }
  }
}
