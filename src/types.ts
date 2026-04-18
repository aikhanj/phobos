import * as THREE from 'three';

export interface GameScene {
  readonly name: string;
  readonly group: THREE.Group;
  readonly spawnPoint: THREE.Vector3;
  load(): void;
  unload(): void;
  update(dt: number): void;
}

export interface SceneConfig {
  dimensions: { width: number; height: number; depth: number };
  ambientColor: number;
  ambientIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
}

export interface BiosignalState {
  fearScore: number;
  bpm: number;
  gazeAversion: number;
  flinchCount: number;
  timeInScene: number;
  timestamp: number;
}

export interface AgentLogEntry {
  source: 'scare_director' | 'audio_director' | 'creature_director' | 'pacing_director' | 'system';
  message: string;
  timestamp: number;
}
