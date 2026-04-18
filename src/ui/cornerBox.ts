import type { AgentLogEntry } from '../types';

const SOURCE_COLORS: Record<string, string> = {
  scare_director: '#ff4444',
  audio_director: '#44aaff',
  creature_director: '#aa44ff',
  pacing_director: '#ffaa44',
  system: '#666666',
};

export class CornerBox {
  private container: HTMLDivElement;
  private videoElement: HTMLVideoElement;
  private fearBar: HTMLDivElement;
  private bpmValue: HTMLSpanElement;
  private logTerminal: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      width: '300px',
      zIndex: '10',
      fontFamily: "'Courier New', monospace",
      display: 'none',
      border: '1px solid #222',
      background: 'rgba(0,0,0,0.85)',
      borderRadius: '2px',
      overflow: 'hidden',
    });

    // Webcam feed
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    Object.assign(this.videoElement.style, {
      width: '100%',
      height: '170px',
      objectFit: 'cover',
      display: 'block',
      transform: 'scaleX(-1)',
      filter: 'grayscale(0.5) contrast(1.3)',
      borderBottom: '1px solid #222',
    });

    // Stats bar (fear + BPM side by side)
    const statsBar = document.createElement('div');
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
    this.container.appendChild(this.videoElement);
    this.container.appendChild(statsBar);
    this.container.appendChild(this.logTerminal);
    document.body.appendChild(this.container);
  }

  attachStream(stream: MediaStream): void {
    this.videoElement.srcObject = stream;
  }

  updateFearScore(score: number): void {
    const clamped = Math.max(0, Math.min(1, score));
    this.fearBar.style.width = `${clamped * 100}%`;
  }

  updateBPM(bpm: number): void {
    this.bpmValue.textContent = bpm > 0 ? String(Math.round(bpm)) : '--';
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
