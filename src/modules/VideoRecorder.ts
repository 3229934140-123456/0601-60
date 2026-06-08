import { RecordingConfig, RecordingResult } from '../types';
import EventBus from '../core/EventBus';
import { generateId, generateVideoThumbnail, clamp } from '../utils';

const defaultConfig: RecordingConfig = {
  maxDuration: 60,
  minDuration: 3,
  cameraFacing: 'back',
  quality: 'medium',
  enableBeauty: false,
  enableFilter: false,
  flashMode: 'off'
};

const qualityPresets = {
  low: { width: 480, height: 640, bitrate: 1000000 },
  medium: { width: 720, height: 1280, bitrate: 2500000 },
  high: { width: 1080, height: 1920, bitrate: 5000000 },
  '4k': { width: 2160, height: 3840, bitrate: 10000000 }
};

class VideoRecorder {
  private config: RecordingConfig;
  private eventBus: EventBus;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private videoElement: HTMLVideoElement | null = null;
  private containerElement: HTMLElement | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private startTime: number = 0;
  private pausedDuration: number = 0;
  private pauseStartTime: number = 0;
  private recordDuration: number = 0;
  private rafId: number | null = null;
  private onDurationChange?: (duration: number) => void;

  constructor(eventBus: EventBus, config?: Partial<RecordingConfig>) {
    this.eventBus = eventBus;
    this.config = { ...defaultConfig, ...config };
  }

  async init(container: HTMLElement, config?: Partial<RecordingConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.containerElement = container;
    await this.setupCamera();
  }

  private async setupCamera(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera is not supported in this browser');
    }

    const preset = qualityPresets[this.config.quality];
    const facingMode = this.config.cameraFacing === 'front' ? 'user' : 'environment';

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode,
        width: { ideal: preset.height },
        height: { ideal: preset.width }
      },
      audio: true
    };

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.createVideoElement();
    } catch (error: any) {
      throw new Error(`Failed to access camera: ${error.message}`);
    }
  }

  private createVideoElement(): void {
    if (!this.containerElement || !this.mediaStream) return;

    this.videoElement = document.createElement('video');
    this.videoElement.srcObject = this.mediaStream;
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.videoElement.style.width = '100%';
    this.videoElement.style.height = '100%';
    this.videoElement.style.objectFit = 'cover';

    if (this.config.cameraFacing === 'front') {
      this.videoElement.style.transform = 'scaleX(-1)';
    }

    this.containerElement.innerHTML = '';
    this.containerElement.appendChild(this.videoElement);
  }

  setMaxDuration(duration: number): void {
    this.config.maxDuration = duration;
  }

  setConfig(config: Partial<RecordingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RecordingConfig {
    return { ...this.config };
  }

  startRecording(): void {
    if (!this.mediaStream || !this.videoElement) {
      throw new Error('Camera is not initialized');
    }

    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    this.recordedChunks = [];
    this.startTime = Date.now();
    this.pausedDuration = 0;
    this.isRecording = true;
    this.isPaused = false;

    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
    }

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        videoBitsPerSecond: qualityPresets[this.config.quality].bitrate
      });
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      await this.handleRecordingComplete();
    };

    this.mediaRecorder.start(100);
    this.eventBus.emit('recordingStart', { timestamp: Date.now() });
    this.startDurationMonitor();
  }

  private startDurationMonitor(): void {
    const monitor = () => {
      if (!this.isRecording || this.isPaused) {
        this.rafId = requestAnimationFrame(monitor);
        return;
      }

      const elapsed = (Date.now() - this.startTime - this.pausedDuration) / 1000;
      this.recordDuration = elapsed;

      if (this.onDurationChange) {
        this.onDurationChange(elapsed);
      }

      if (elapsed >= this.config.maxDuration) {
        this.stopRecording();
        return;
      }

      this.rafId = requestAnimationFrame(monitor);
    };

    this.rafId = requestAnimationFrame(monitor);
  }

  pauseRecording(): void {
    if (!this.isRecording || this.isPaused || !this.mediaRecorder) return;

    this.mediaRecorder.pause();
    this.isPaused = true;
    this.pauseStartTime = Date.now();
  }

  resumeRecording(): void {
    if (!this.isRecording || !this.isPaused || !this.mediaRecorder) return;

    this.mediaRecorder.resume();
    this.isPaused = false;
    this.pausedDuration += Date.now() - this.pauseStartTime;
  }

  stopRecording(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.isRecording || !this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      const finalDuration = this.recordDuration;
      this.isRecording = false;
      this.isPaused = false;

      this.eventBus.emit('recordingStop', {
        timestamp: Date.now(),
        duration: finalDuration
      });

      if (finalDuration < (this.config.minDuration || 0)) {
        this.recordedChunks = [];
        reject(new Error(`Recording is too short. Minimum duration is ${this.config.minDuration} seconds`));
        return;
      }

      this.mediaRecorder.stop();

      const checkResult = () => {
        setTimeout(async () => {
          if (this.recordedChunks.length > 0) {
            try {
              const result = await this.createRecordingResult(finalDuration);
              this.eventBus.emit('recordingComplete', result);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          } else {
            checkResult();
          }
        }, 100);
      };

      checkResult();
    });
  }

  private async handleRecordingComplete(): Promise<void> {
  }

  private async createRecordingResult(duration: number): Promise<RecordingResult> {
    const blob = new Blob(this.recordedChunks, { type: this.recordedChunks[0]?.type || 'video/webm' });
    const file = new File([blob], `record_${Date.now()}.webm`, { type: blob.type });

    const videoUrl = URL.createObjectURL(file);
    let coverImage = '';
    let width = 0;
    let height = 0;

    try {
      const video = document.createElement('video');
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          width = video.videoWidth;
          height = video.videoHeight;
          resolve();
        };
        video.onerror = reject;
        video.src = videoUrl;
      });

      coverImage = await generateVideoThumbnail(videoUrl, 0.5);
      URL.revokeObjectURL(videoUrl);
    } catch (e) {
      console.warn('[EduShortVideo SDK] Failed to generate thumbnail:', e);
    }

    return {
      videoFile: file,
      coverImage,
      duration: Math.round(duration * 100) / 100,
      width,
      height,
      size: file.size
    };
  }

  async switchCamera(): Promise<void> {
    if (!this.mediaStream) {
      throw new Error('Camera is not initialized');
    }

    this.config.cameraFacing = this.config.cameraFacing === 'front' ? 'back' : 'front';

    this.mediaStream.getTracks().forEach(track => track.stop());
    this.mediaStream = null;

    await this.setupCamera();
  }

  toggleFlash(): boolean {
    if (!this.mediaStream) return false;

    const videoTrack = this.mediaStream.getVideoTracks()[0];
    if (!videoTrack) return false;

    try {
      const capabilities = videoTrack.getCapabilities() as any;
      if (capabilities.torch) {
        const settings = videoTrack.getSettings() as any;
        const newState = !settings.torch;
        videoTrack.applyConstraints({
          advanced: [{ torch: newState } as any]
        });
        this.config.flashMode = newState ? 'on' : 'off';
        return newState;
      }
    } catch (e) {
      console.warn('[EduShortVideo SDK] Flash toggle not supported:', e);
    }

    return false;
  }

  getCurrentDuration(): number {
    if (!this.isRecording) return 0;
    if (this.isPaused) return this.recordDuration;
    return (Date.now() - this.startTime - this.pausedDuration) / 1000;
  }

  setDurationCallback(callback: (duration: number) => void): void {
    this.onDurationChange = callback;
  }

  isRecordingActive(): boolean {
    return this.isRecording;
  }

  isRecordingPaused(): boolean {
    return this.isPaused;
  }

  async takePhoto(): Promise<string> {
    if (!this.videoElement || !this.mediaStream) {
      throw new Error('Camera is not initialized');
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Cannot get canvas context');
    }

    if (this.config.cameraFacing === 'front') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(this.videoElement, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  destroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.recordedChunks = [];
    this.isRecording = false;
    this.isPaused = false;
  }
}

export default VideoRecorder;
