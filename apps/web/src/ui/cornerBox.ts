import type { AgentLogEntry } from '@phobos/types';

const SOURCE_COLORS: Record<string, string> = {
  scare_director: '#ff4444',
  audio_director: '#44aaff',
  creature_director: '#aa44ff',
  pacing_director: '#ffaa44',
  system: '#666666',
  phobos: '#00ff41',
};

export class CornerBox {
  private container: HTMLDivElement;
  private videoWrap: HTMLDivElement;
  private videoElement: HTMLVideoElement;
  private fearBar: HTMLDivElement;
  private bpmValue: HTMLSpanElement;
  private logTerminal: HTMLDivElement;
  private statsBar: HTMLDivElement | null = null;
  private analysisLine!: HTMLDivElement;
  private noCamOverlay!: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      // Bigger + brighter border: players reported they couldn't find
      // the webcam feed at all. 360px wide panel with an orange accent
      // border matches the CRT aesthetic and is impossible to miss.
      width: '360px',
      zIndex: '10',
      fontFamily: "'Courier New', monospace",
      display: 'none',
      border: '2px solid #c09030',
      background: 'rgba(0,0,0,0.92)',
      borderRadius: '2px',
      overflow: 'hidden',
      boxShadow: '0 0 24px rgba(192,144,48,0.35), 0 0 60px rgba(0,0,0,0.8)',
    });

    // Webcam feed — wrapper hosts overlays (webcam ghost) on top of <video>
    this.videoWrap = document.createElement('div');
    Object.assign(this.videoWrap.style, {
      position: 'relative',
      width: '100%',
      // Taller video feed (210px) so it's obviously the player's face.
      // Previous 170px was too short for the 360px width (~2:1 letterbox).
      height: '210px',
      borderBottom: '2px solid #c09030',
      overflow: 'hidden',
      background: '#000',
    });

    // Corner label above the video: "LIVE WEBCAM · SUBJECT 4722"
    const videoLabel = document.createElement('div');
    videoLabel.textContent = '● LIVE · SUBJECT 4722';
    Object.assign(videoLabel.style, {
      position: 'absolute',
      top: '6px',
      left: '8px',
      zIndex: '3',
      fontSize: '10px',
      color: '#ff4444',
      letterSpacing: '0.12em',
      fontWeight: '700',
      textShadow: '0 0 6px rgba(0,0,0,0.9)',
      pointerEvents: 'none',
    });
    this.videoWrap.appendChild(videoLabel);

    // "NO WEBCAM" overlay — hidden by default, shown when stream is null
    // so players know the feed failed rather than seeing a silent black box.
    this.noCamOverlay = document.createElement('div');
    this.noCamOverlay.textContent = 'NO WEBCAM\nrefresh to grant access';
    Object.assign(this.noCamOverlay.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      color: '#c09030',
      background: 'rgba(0,0,0,0.8)',
      fontSize: '12px',
      letterSpacing: '0.15em',
      whiteSpace: 'pre',
      zIndex: '2',
      pointerEvents: 'none',
    });
    this.videoWrap.appendChild(this.noCamOverlay);

    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    Object.assign(this.videoElement.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      transform: 'scaleX(-1)',
      filter: 'grayscale(0.5) contrast(1.3)',
    });
    this.videoWrap.appendChild(this.videoElement);

    // Stats bar (fear + BPM side by side)
    this.statsBar = document.createElement('div');
    const statsBar = this.statsBar;
    Object.assign(statsBar.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '8px 10px',
      gap: '12px',
      borderBottom: '1px solid #1a1a1a',
    });

    // Fear meter
    const fearWrap = document.createElement('div');
    Object.assign(fearWrap.style, { flex: '1' });

    const fearLabel = document.createElement('div');
    fearLabel.textContent = 'FEAR';
    Object.assign(fearLabel.style, {
      fontSize: '9px',
      color: '#666',
      letterSpacing: '0.15em',
      marginBottom: '3px',
    });

    const fearTrack = document.createElement('div');
    Object.assign(fearTrack.style, {
      width: '100%',
      height: '4px',
      background: '#1a1a1a',
      borderRadius: '2px',
      overflow: 'hidden',
    });

    this.fearBar = document.createElement('div');
    Object.assign(this.fearBar.style, {
      width: '0%',
      height: '100%',
      background: 'linear-gradient(90deg, #ff0000, #ff4400)',
      transition: 'width 0.5s ease',
      borderRadius: '2px',
    });

    fearTrack.appendChild(this.fearBar);
    fearWrap.appendChild(fearLabel);
    fearWrap.appendChild(fearTrack);

    // BPM display
    const bpmWrap = document.createElement('div');
    Object.assign(bpmWrap.style, { textAlign: 'right' });

    const bpmLabel = document.createElement('div');
    bpmLabel.textContent = 'BPM';
    Object.assign(bpmLabel.style, {
      fontSize: '9px',
      color: '#666',
      letterSpacing: '0.15em',
      marginBottom: '2px',
    });

    this.bpmValue = document.createElement('span');
    this.bpmValue.textContent = '--';
    Object.assign(this.bpmValue.style, {
      fontSize: '18px',
      color: '#ff4444',
      fontWeight: 'bold',
    });

    bpmWrap.appendChild(bpmLabel);
    bpmWrap.appendChild(this.bpmValue);

    statsBar.appendChild(fearWrap);
    statsBar.appendChild(bpmWrap);

    // Live analysis line — shows what the webcam/mic/LLM/profiler are
    // currently reading. Updated every 500ms from the biosignal tick.
    // Prior to this, players had no way to tell the AI was "watching" —
    // they saw a FEAR bar but no sense of WHY it was moving. This line
    // makes the reading legible in real time.
    this.analysisLine = document.createElement('div');
    Object.assign(this.analysisLine.style, {
      padding: '4px 10px 6px',
      fontSize: '9.5px',
      lineHeight: '1.35',
      color: '#88ff88',
      borderBottom: '1px solid #1a1a1a',
      letterSpacing: '0.02em',
      wordBreak: 'break-word',
    });
    this.analysisLine.textContent = 'FACE: --  MIC: --  LLM: --  VEC: --';

    // Agent log terminal
    this.logTerminal = document.createElement('div');
    Object.assign(this.logTerminal.style, {
      height: '120px',
      overflowY: 'auto',
      padding: '6px 8px',
      fontSize: '10px',
      lineHeight: '1.5',
      color: '#00ff41',
      scrollbarWidth: 'thin',
      scrollbarColor: '#333 transparent',
    });

    // Assemble
    this.container.appendChild(this.videoWrap);
    this.container.appendChild(statsBar);
    this.container.appendChild(this.analysisLine);
    this.container.appendChild(this.logTerminal);
    document.body.appendChild(this.container);
  }

  /**
   * Update the live analysis readout. Called from the biosignal tick.
   * One compact line — abbreviated tokens keep it readable in 300px.
   *   face:   top expression + confidence (e.g. "fearful 0.42")
   *   mic:    loudness + onset flag ("0.18+" for onset)
   *   llm:    on/off + time-since-last-tick
   *   vec:    profiler's dominant vector + phase
   */
  setAnalysisLine(parts: {
    faceTop?: string;
    faceConf?: number;
    faceDetected?: boolean;
    micLoud?: number;
    micOnset?: boolean;
    micActive?: boolean;
    llmOnline?: boolean;
    llmLastTick?: number;
    vector?: string;
    phase?: string;
  }): void {
    const face = parts.faceDetected
      ? `FACE:${parts.faceTop ?? '?'} ${(parts.faceConf ?? 0).toFixed(2)}`
      : 'FACE:no-face';
    const mic = parts.micActive
      ? `MIC:${(parts.micLoud ?? 0).toFixed(2)}${parts.micOnset ? '!' : ''}`
      : 'MIC:off';
    const llm = parts.llmOnline
      ? `LLM:on${parts.llmLastTick !== undefined ? ' ' + Math.round(parts.llmLastTick) + 's' : ''}`
      : 'LLM:off';
    const vec = `VEC:${parts.vector ?? 'none'}${parts.phase === 'AMPLIFYING' ? '*' : ''}`;
    this.analysisLine.textContent = `${face} · ${mic} · ${llm} · ${vec}`;
    // Color shift: green when AI is actively reading, grey when blind.
    const reading = parts.faceDetected || parts.micActive;
    this.analysisLine.style.color = reading ? '#88ff88' : '#666666';
  }

  attachStream(stream: MediaStream): void {
    this.videoElement.srcObject = stream;
    this.noCamOverlay.style.display = 'none';
  }

  /** Show the "NO WEBCAM" overlay — call when getUserMedia was denied. */
  showNoWebcam(): void {
    this.noCamOverlay.style.display = 'flex';
  }

  /** The <video> element showing the webcam feed. */
  getVideoElement(): HTMLVideoElement { return this.videoElement; }

  /** Relative-positioned wrapper around the video — mount overlays here. */
  getVideoContainer(): HTMLDivElement { return this.videoWrap; }

  updateFearScore(score: number): void {
    const clamped = Math.max(0, Math.min(1, score));
    this.fearBar.style.width = `${clamped * 100}%`;
  }

  // quality: 'fresh' live, 'laggy' wavering, 'stale' held-but-old, 'none' not yet paired.
  // BPM never blanks once we've seen a sample — we just dim/tint the number when
  // data ages, so the reader can see connection weakening without losing the value.
  updateBPM(bpm: number, quality: 'none' | 'fresh' | 'laggy' | 'stale' = 'fresh'): void {
    this.bpmValue.textContent = bpm > 0 ? String(Math.round(bpm)) : '--';
    switch (quality) {
      case 'fresh':
        this.bpmValue.style.color = '#ff4444';
        this.bpmValue.style.opacity = '1';
        break;
      case 'laggy':
        this.bpmValue.style.color = '#cc7722';
        this.bpmValue.style.opacity = '0.8';
        break;
      case 'stale':
        this.bpmValue.style.color = '#777777';
        this.bpmValue.style.opacity = '0.55';
        break;
      case 'none':
      default:
        this.bpmValue.style.color = '#ff4444';
        this.bpmValue.style.opacity = '1';
        break;
    }
  }

  appendLog(entry: AgentLogEntry): void {
    const line = document.createElement('div');
    const color = SOURCE_COLORS[entry.source] || '#00ff41';
    line.innerHTML = `<span style="color:${color}">[${entry.source}]</span> ${this.escapeHtml(entry.message)}`;
    this.logTerminal.appendChild(line);
    this.logTerminal.scrollTop = this.logTerminal.scrollHeight;
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  /** The outer container — needed by RevealSequence for expansion. */
  getContainer(): HTMLDivElement {
    return this.container;
  }

  /**
   * Expand the corner box to fill the viewport (reveal sequence) or
   * reset it back to the corner position.
   */
  setExpanding(expanding: boolean): void {
    if (expanding) {
      Object.assign(this.container.style, {
        transition: 'all 3s cubic-bezier(0.4, 0, 0.2, 1)',
        top: '0',
        right: '0',
        left: '0',
        bottom: '0',
        width: '100vw',
        height: '100vh',
        borderRadius: '0',
        zIndex: '35',
        border: 'none',
      });
      Object.assign(this.videoWrap.style, {
        height: '100%',
        borderBottom: 'none',
      });
      if (this.statsBar) this.statsBar.style.display = 'none';
      this.logTerminal.style.display = 'none';
    } else {
      Object.assign(this.container.style, {
        transition: 'none',
        top: '16px',
        right: '16px',
        left: '',
        bottom: '',
        width: '300px',
        height: '',
        borderRadius: '2px',
        zIndex: '10',
        border: '1px solid #222',
      });
      Object.assign(this.videoWrap.style, {
        height: '170px',
        borderBottom: '1px solid #222',
      });
      if (this.statsBar) this.statsBar.style.display = 'flex';
      this.logTerminal.style.display = 'block';
    }
  }

  /**
   * Rapidly append lines to the agent log — used for the reveal data dump.
   * Returns a promise that resolves when all lines have been appended.
   */
  rapidScroll(lines: string[], intervalMs = 80): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const step = (): void => {
        if (i >= lines.length) { resolve(); return; }
        this.appendLog({ source: 'phobos', message: lines[i], timestamp: Date.now() });
        i++;
        setTimeout(step, intervalMs);
      };
      step();
    });
  }

  dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
