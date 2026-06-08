import { VideoInfo, VideoQuality } from '../types';
import EventBus from '../core/EventBus';

class VideoPlayer {
  private eventBus: EventBus;
  private videoElement: HTMLVideoElement | null = null;
  private containerElement: HTMLElement | null = null;
  private currentVideo: VideoInfo | null = null;
  private qualities: VideoQuality[] = [];
  private currentQuality: VideoQuality | null = null;
  private isPlaying: boolean = false;
  private isMuted: boolean = false;
  private volume: number = 1;
  private playRate: number = 1;
  private isFullscreen: boolean = false;
  private rafId: number | null = null;
  private _onTimeUpdate?: () => void;
  private _onPlay?: () => void;
  private _onPause?: () => void;
  private _onEnded?: () => void;
  private _onLoadedMetadata?: () => void;
  private _onError?: () => void;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  init(container: HTMLElement): void {
    this.containerElement = container;
    this.createVideoElement();
    this.setupEventListeners();
  }

  private createVideoElement(): void {
    if (!this.containerElement) return;

    this.videoElement = document.createElement('video');
    this.videoElement.style.width = '100%';
    this.videoElement.style.height = '100%';
    this.videoElement.style.objectFit = 'contain';
    this.videoElement.playsInline = true;
    (this.videoElement as any).webkitPlaysInline = true;

    this.containerElement.innerHTML = '';
    this.containerElement.appendChild(this.videoElement);
  }

  private setupEventListeners(): void {
    if (!this.videoElement) return;

    this._onPlay = () => {
      this.isPlaying = true;
      this.eventBus.emit('playStart', {
        videoId: this.currentVideo?.videoId || '',
        currentTime: this.videoElement?.currentTime || 0
      });
    };

    this._onPause = () => {
      this.isPlaying = false;
      this.eventBus.emit('playPause', {
        videoId: this.currentVideo?.videoId || '',
        currentTime: this.videoElement?.currentTime || 0
      });
    };

    this._onEnded = () => {
      this.isPlaying = false;
      this.eventBus.emit('playEnd', {
        videoId: this.currentVideo?.videoId || '',
        duration: this.videoElement?.duration || 0
      });
      this.stopProgressMonitor();
    };

    this._onLoadedMetadata = () => {
      if (this.videoElement) {
        this.eventBus.emit('playProgress', {
          videoId: this.currentVideo?.videoId || '',
          currentTime: this.videoElement.currentTime,
          duration: this.videoElement.duration,
          percent: 0
        });
      }
    };

    this._onError = () => {
      this.eventBus.emit('playError', {
        videoId: this.currentVideo?.videoId || '',
        error: 'Video playback error'
      });
    };

    this._onTimeUpdate = () => {
      this.emitProgress();
    };

    this.videoElement.addEventListener('play', this._onPlay);
    this.videoElement.addEventListener('pause', this._onPause);
    this.videoElement.addEventListener('ended', this._onEnded);
    this.videoElement.addEventListener('loadedmetadata', this._onLoadedMetadata);
    this.videoElement.addEventListener('error', this._onError);
    this.videoElement.addEventListener('timeupdate', this._onTimeUpdate);
  }

  private startProgressMonitor(): void {
    if (this.rafId) return;

    const monitor = () => {
      if (this.isPlaying) {
        this.emitProgress();
      }
      this.rafId = requestAnimationFrame(monitor);
    };

    this.rafId = requestAnimationFrame(monitor);
  }

  private stopProgressMonitor(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private emitProgress(): void {
    if (!this.videoElement || !this.currentVideo) return;

    const currentTime = this.videoElement.currentTime;
    const duration = this.videoElement.duration;
    const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

    this.eventBus.emit('playProgress', {
      videoId: this.currentVideo.videoId,
      currentTime,
      duration,
      percent
    });
  }

  async loadVideo(videoInfo: VideoInfo, qualities?: VideoQuality[]): Promise<void> {
    if (!this.videoElement) {
      throw new Error('Video player is not initialized');
    }

    this.currentVideo = videoInfo;
    this.qualities = qualities || [];

    if (this.qualities.length === 0) {
      this.qualities = [{
        quality: 'auto',
        label: '自动',
        url: videoInfo.videoUrl,
        width: videoInfo.width,
        height: videoInfo.height
      }];
    }

    this.currentQuality = this.qualities[0];
    this.videoElement.src = this.currentQuality.url;

    this.videoElement.load();
    this.startProgressMonitor();
  }

  async loadVideoStream(
    videoUrl: string,
    options?: {
      videoId?: string;
      qualities?: VideoQuality[];
      title?: string;
    }
  ): Promise<void> {
    const videoInfo: VideoInfo = {
      videoId: options?.videoId || 'current',
      title: options?.title || '',
      coverUrl: '',
      videoUrl,
      duration: 0,
      width: 0,
      height: 0,
      size: 0,
      likes: 0,
      favorites: 0,
      comments: 0,
      views: 0,
      createdAt: Date.now()
    };

    return this.loadVideo(videoInfo, options?.qualities);
  }

  play(): Promise<void> {
    if (!this.videoElement) {
      return Promise.reject(new Error('Video player is not initialized'));
    }

    this.startProgressMonitor();
    return this.videoElement.play();
  }

  pause(): void {
    if (!this.videoElement) return;
    this.videoElement.pause();
  }

  togglePlay(): boolean {
    if (!this.videoElement) return false;

    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }

    return !this.isPlaying;
  }

  seek(time: number): void {
    if (!this.videoElement) return;
    this.videoElement.currentTime = time;
  }

  seekToPercent(percent: number): void {
    if (!this.videoElement || !this.videoElement.duration) return;
    const clampedPercent = Math.max(0, Math.min(100, percent));
    this.videoElement.currentTime = (clampedPercent / 100) * this.videoElement.duration;
  }

  setVolume(volume: number): void {
    if (!this.videoElement) return;
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.videoElement.volume = clampedVolume;
    this.volume = clampedVolume;

    if (clampedVolume > 0) {
      this.isMuted = false;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  mute(): void {
    if (!this.videoElement) return;
    this.videoElement.muted = true;
    this.isMuted = true;
  }

  unmute(): void {
    if (!this.videoElement) return;
    this.videoElement.muted = false;
    this.isMuted = false;
    if (this.volume === 0) {
      this.videoElement.volume = 0.5;
      this.volume = 0.5;
    }
  }

  toggleMute(): boolean {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
    return this.isMuted;
  }

  setPlaybackRate(rate: number): void {
    if (!this.videoElement) return;
    this.videoElement.playbackRate = rate;
    this.playRate = rate;
  }

  getPlaybackRate(): number {
    return this.playRate;
  }

  getCurrentTime(): number {
    return this.videoElement?.currentTime || 0;
  }

  getDuration(): number {
    return this.videoElement?.duration || 0;
  }

  getQualities(): VideoQuality[] {
    return [...this.qualities];
  }

  getCurrentQuality(): VideoQuality | null {
    return this.currentQuality ? { ...this.currentQuality } : null;
  }

  setQuality(quality: VideoQuality['quality'] | string): boolean {
    const targetQuality = this.qualities.find(q => q.quality === quality);
    if (!targetQuality || !this.videoElement) return false;

    const currentTime = this.videoElement.currentTime;
    const wasPlaying = this.isPlaying;

    this.currentQuality = targetQuality;
    this.videoElement.src = targetQuality.url;
    this.videoElement.currentTime = currentTime;

    if (wasPlaying) {
      this.videoElement.play().catch(() => {});
    }

    return true;
  }

  toggleFullscreen(): boolean {
    if (!this.containerElement) return false;

    if (!document.fullscreenElement) {
      this.containerElement.requestFullscreen().catch(() => {});
      this.isFullscreen = true;
    } else {
      document.exitFullscreen().catch(() => {});
      this.isFullscreen = false;
    }

    return this.isFullscreen;
  }

  isVideoPlaying(): boolean {
    return this.isPlaying;
  }

  isVideoMuted(): boolean {
    return this.isMuted;
  }

  isVideoFullscreen(): boolean {
    return this.isFullscreen;
  }

  getCurrentVideo(): VideoInfo | null {
    return this.currentVideo ? { ...this.currentVideo } : null;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  async like(videoId?: string): Promise<boolean> {
    const id = videoId || this.currentVideo?.videoId;
    if (!id) return false;

    if (this.currentVideo && this.currentVideo.videoId === id) {
      this.currentVideo.isLiked = true;
      this.currentVideo.likes += 1;
    }

    this.eventBus.emit('like', {
      videoId: id,
      count: this.currentVideo?.likes || 1
    });

    return true;
  }

  async unlike(videoId?: string): Promise<boolean> {
    const id = videoId || this.currentVideo?.videoId;
    if (!id) return false;

    if (this.currentVideo && this.currentVideo.videoId === id) {
      this.currentVideo.isLiked = false;
      this.currentVideo.likes = Math.max(0, this.currentVideo.likes - 1);
    }

    this.eventBus.emit('unlike', {
      videoId: id,
      count: this.currentVideo?.likes || 0
    });

    return true;
  }

  toggleLike(videoId?: string): boolean {
    const id = videoId || this.currentVideo?.videoId;
    if (!id) return false;

    const isLiked = this.currentVideo?.isLiked;

    if (isLiked) {
      this.unlike(id);
      return false;
    } else {
      this.like(id);
      return true;
    }
  }

  async favorite(videoId?: string): Promise<boolean> {
    const id = videoId || this.currentVideo?.videoId;
    if (!id) return false;

    if (this.currentVideo && this.currentVideo.videoId === id) {
      this.currentVideo.isFavorited = true;
      this.currentVideo.favorites += 1;
    }

    this.eventBus.emit('favorite', {
      videoId: id,
      count: this.currentVideo?.favorites || 1
    });

    return true;
  }

  async unfavorite(videoId?: string): Promise<boolean> {
    const id = videoId || this.currentVideo?.videoId;
    if (!id) return false;

    if (this.currentVideo && this.currentVideo.videoId === id) {
      this.currentVideo.isFavorited = false;
      this.currentVideo.favorites = Math.max(0, this.currentVideo.favorites - 1);
    }

    this.eventBus.emit('unfavorite', {
      videoId: id,
      count: this.currentVideo?.favorites || 0
    });

    return true;
  }

  toggleFavorite(videoId?: string): boolean {
    const id = videoId || this.currentVideo?.videoId;
    if (!id) return false;

    const isFavorited = this.currentVideo?.isFavorited;

    if (isFavorited) {
      this.unfavorite(id);
      return false;
    } else {
      this.favorite(id);
      return true;
    }
  }

  destroy(): void {
    this.stopProgressMonitor();

    if (this.videoElement) {
      if (this._onPlay) this.videoElement.removeEventListener('play', this._onPlay);
      if (this._onPause) this.videoElement.removeEventListener('pause', this._onPause);
      if (this._onEnded) this.videoElement.removeEventListener('ended', this._onEnded);
      if (this._onLoadedMetadata) this.videoElement.removeEventListener('loadedmetadata', this._onLoadedMetadata);
      if (this._onError) this.videoElement.removeEventListener('error', this._onError);
      if (this._onTimeUpdate) this.videoElement.removeEventListener('timeupdate', this._onTimeUpdate);

      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement = null;
    }

    this.containerElement = null;
    this.currentVideo = null;
    this.qualities = [];
    this.currentQuality = null;
    this.isPlaying = false;
  }
}

export default VideoPlayer;
