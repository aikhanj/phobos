export class TitleScreen {
  private container: HTMLDivElement;
  private videoElement: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private startCallback: (() => void) | null = null;
  private hrButton: HTMLButtonElement;
  private hrConnectCallback: (() => Promise<void>) | null = null;
  private hrConnected = false;

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

    // Connect HR Monitor button — Web Bluetooth requires a user gesture, so
    // pairing happens from the title screen before the game starts.
    this.hrButton = document.createElement('button');
    this.hrButton.textContent = 'connect heart rate monitor';
    Object.assign(this.hrButton.style, {
      marginTop: '1.2rem',
      padding: '0.6rem 1.2rem',
      background: 'transparent',
      border: '1px solid #333',
      color: '#777',
      fontFamily: "'Courier New', monospace",
      fontSize: '0.7rem',
      letterSpacing: '0.2rem',
      textTransform: 'uppercase',
      cursor: 'pointer',
      userSelect: 'none',
    });
    this.hrButton.addEventListener('mouseenter', () => {
      this.hrButton.style.color = '#bbb';
      this.hrButton.style.borderColor = '#555';
    });
    this.hrButton.addEventListener('mouseleave', () => {
      this.hrButton.style.color = this.hrConnected ? '#5a9' : '#777';
      this.hrButton.style.borderColor = this.hrConnected ? '#5a9' : '#333';
    });
    this.hrButton.addEventListener('click', this.onHrClick);

    textWrap.appendChild(title);
    textWrap.appendChild(subtitle);
    textWrap.appendChild(this.hrButton);
    this.container.appendChild(this.videoElement);
    this.container.appendChild(textWrap);

    // Click on container starts the game — but not when the HR button was clicked.
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

  onHrConnect(callback: () => Promise<void>): void {
    this.hrConnectCallback = callback;
  }

  setHrConnected(connected: boolean, label?: string): void {
    this.hrConnected = connected;
    if (connected) {
      this.hrButton.textContent = label ? `hr: ${label}` : 'hr connected';
      this.hrButton.style.color = '#5a9';
      this.hrButton.style.borderColor = '#5a9';
    } else {
      this.hrButton.textContent = 'connect heart rate monitor';
      this.hrButton.style.color = '#777';
      this.hrButton.style.borderColor = '#333';
    }
  }

  dispose(): void {
    this.container.removeEventListener('click', this.onClick);
    this.hrButton.removeEventListener('click', this.onHrClick);
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  private onClick = (evt: MouseEvent): void => {
    // Don't start the game if the user clicked the HR button
    if (evt.target === this.hrButton || this.hrButton.contains(evt.target as Node)) {
      return;
    }
    if (this.startCallback) {
      this.startCallback();
    }
  };

  private onHrClick = async (evt: MouseEvent): Promise<void> => {
    evt.stopPropagation();
    if (!this.hrConnectCallback) return;
    this.hrButton.textContent = 'pairing...';
    this.hrButton.disabled = true;
    try {
      await this.hrConnectCallback();
    } catch {
      this.setHrConnected(false);
    } finally {
      this.hrButton.disabled = false;
    }
  };
}
