export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface VoiceOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  sampleRate?: 16000 | 22050 | 24000 | 44100;
  position?: Vec3;
  gain?: number;
  bypassCache?: boolean;
  voiceSettings?: VoiceSettings;
  horrorFx?: boolean;
}

export interface SFXOptions {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
  position?: Vec3;
  gain?: number;
  loop?: boolean;
  bypassCache?: boolean;
}

export interface SpeakHandle {
  done: Promise<void>;
  stop(): void;
  getBuffer(): AudioBuffer | null;
}

export interface PlayHandle {
  done: Promise<void>;
  stop(): void;
}

export interface VoiceEngineOptions {
  context: AudioContext;
  destination: AudioNode;
  proxyUrl: string;
  defaultVoiceId?: string;
  defaultModelId?: string;
  cache?: boolean;
  cacheSize?: number;
  debug?: boolean;
}
