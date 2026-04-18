export class TitleScreen {
  private container: HTMLDivElement;
  private videoElement: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private startCallback: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '100',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000',
      cursor: 'pointer',
      flexDirection: 'column',
    });

    // Webcam background
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    Object.assign(this.videoElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      opacity: '0.12',
      filter: 'grayscale(1) contrast(1.4)',
      transform: 'scaleX(-1)',
    });

    // Title text container
    const textWrap = document.createElement('div');
    Object.assign(textWrap.style, {
      position: 'relative',
      zIndex: '1',
      textAlign: 'center',
    });

    const title = document.createElement('h1');
    title.textContent = 'PHOBOS';
    Object.assign(title.style, {
      fontFamily: "'Times New Roman', 'Georgia', serif",
      fontWeight: '300',
      fontSize: '8rem',
      letterSpacing: '1.5rem',
      color: '#fff',
      textShadow: '0 0 40px rgba(255,0,0,0.25), 0 0 80px rgba(255,0,0,0.1)',
      margin: '0',
      userSelect: 'none',
    });

    const subtitle = document.createElement('p');
    subtitle.textContent = 'click to begin';
    Object.assign(subtitle.style, {
      fontFamily: "'Courier New', monospace",
      fontSize: '0.85rem',
      color: '#444',
      marginTop: '2rem',
      letterSpacing: '0.3rem',
      textTransform: 'uppercase',
      userSelect: 'none',
    });

    textWrap.appendChild(title);
    textWrap.appendChild(subtitle);
    this.container.appendChild(this.videoElement);
    this.container.appendChild(textWrap);

    // Click handler
    this.container.addEventListener('click', this.onClick);
  }

  async show(): Promise<void> {
    document.body.appendChild(this.container);

    // Request webcam
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
      });
      this.videoElement.srcObject = this.stream;
    } catch {
      // Webcam denied — title screen still works, just no video bg
      this.videoElement.style.display = 'none';
    }
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  onStart(callback: () => void): void {
    this.startCallback = callback;
  }

  dispose(): void {
    this.container.removeEventListener('click', this.onClick);
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  private onClick = (): void => {
    if (this.startCallback) {
      this.startCallback();
    }
  };
}
