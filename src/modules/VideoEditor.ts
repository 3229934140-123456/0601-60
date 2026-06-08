import { WatermarkConfig, EditResult } from '../types';
import { generateVideoThumbnail, generateId } from '../utils';

class VideoEditor {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private processingVideo: HTMLVideoElement | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isProcessing: boolean = false;
  private currentProcessId: string | null = null;
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
  }

  async addWatermark(
    videoFile: File,
    watermarkConfig: WatermarkConfig
  ): Promise<EditResult> {
    return this.processVideo(videoFile, {
      watermark: watermarkConfig,
      startTime: 0,
      endTime: 0
    });
  }

  async trimVideo(
    videoFile: File,
    startTime: number,
    endTime: number
  ): Promise<{ videoFile: File; duration: number; coverImage: string; width: number; height: number }> {
    const result = await this.processVideo(videoFile, {
      startTime,
      endTime,
      watermark: null
    });

    return {
      videoFile: result.videoFile,
      duration: result.duration,
      coverImage: result.coverImage,
      width: result.width,
      height: result.height
    };
  }

  private async processVideo(
    videoFile: File,
    options: {
      watermark: WatermarkConfig | null;
      startTime: number;
      endTime: number;
    }
  ): Promise<EditResult> {
    if (this.isProcessing) {
      throw new Error('Another video is being processed');
    }

    this.isProcessing = true;
    this.currentProcessId = generateId('process');
    this.recordedChunks = [];

    try {
      const video = document.createElement('video');
      video.muted = false;
      video.playsInline = true;
      (video as any).webkitPlaysInline = true;

      const videoUrl = URL.createObjectURL(videoFile);
      video.src = videoUrl;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
      });

      const width = video.videoWidth;
      const height = video.videoHeight;
      const totalDuration = video.duration;

      const startTime = options.startTime || 0;
      const endTime = options.endTime && options.endTime > 0 ? Math.min(options.endTime, totalDuration) : totalDuration;
      const targetDuration = endTime - startTime;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      let watermarkImg: HTMLImageElement | null = null;
      if (options.watermark?.imageUrl) {
        watermarkImg = await this.loadImage(options.watermark.imageUrl);
      }

      const canvasStream = canvas.captureStream(30);

      let combinedStream: MediaStream;
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(video);
        const destination = audioCtx.createMediaStreamDestination();
        source.connect(destination);
        this.audioContext = audioCtx;
        this.audioDestination = destination;

        const audioTrack = destination.stream.getAudioTracks()[0];
        const videoTrack = canvasStream.getVideoTracks()[0];

        combinedStream = new MediaStream([videoTrack, audioTrack]);
      } catch (e) {
        combinedStream = canvasStream;
      }

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 4000000
        });
      } catch (e) {
        recorder = new MediaRecorder(combinedStream);
      }

      this.mediaRecorder = recorder;
      this.processingVideo = video;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(this.recordedChunks, { type: mimeType });
          resolve(blob);
        };
        recorder.onerror = () => reject(new Error('Recording error'));
      });

      video.currentTime = startTime;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      recorder.start(100);

      await video.play();

      const drawFrame = () => {
        if (!this.isProcessing || this.currentProcessId !== this._currentProcessId) return;

        ctx.drawImage(video, 0, 0, width, height);

        if (options.watermark) {
          if (watermarkImg) {
            this.drawWatermarkImage(ctx, watermarkImg, options.watermark, width, height);
          } else if (options.watermark.text) {
            this.drawWatermarkText(ctx, options.watermark.text, options.watermark, width, height);
          }
        }

        if (video.currentTime < endTime && !video.ended) {
          requestAnimationFrame(drawFrame);
        } else {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      };

      requestAnimationFrame(drawFrame);

      const recordedBlob = await recordingPromise;

      video.pause();

      const processedFile = new File(
        [recordedBlob],
        `processed_${Date.now()}.webm`,
        { type: mimeType }
      );

      const processedUrl = URL.createObjectURL(processedFile);
      const coverImage = await this.generateCover(processedFile, 0.5);
      URL.revokeObjectURL(processedUrl);

      URL.revokeObjectURL(videoUrl);

      return {
        videoFile: processedFile,
        coverImage,
        duration: targetDuration,
        width,
        height,
        watermarkApplied: !!options.watermark
      };
    } finally {
      this.cleanupProcessing();
    }
  }

  get _currentProcessId(): string | null {
    return this.currentProcessId;
  }

  private cleanupProcessing(): void {
    this.isProcessing = false;
    this.currentProcessId = null;

    if (this.processingVideo) {
      this.processingVideo.pause();
      this.processingVideo.src = '';
      this.processingVideo = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.mediaRecorder = null;
    this.recordedChunks = [];

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
    this.audioDestination = null;
  }

  cancelProcessing(): boolean {
    if (!this.isProcessing) return false;
    this.cleanupProcessing();
    return true;
  }

  isProcessingVideo(): boolean {
    return this.isProcessing;
  }

  async generateCover(videoFile: File, time: number = 1): Promise<string> {
    const url = URL.createObjectURL(videoFile);
    try {
      const thumbnail = await generateVideoThumbnail(url, time);
      return thumbnail;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async generateMultipleCovers(
    videoFile: File,
    count: number = 5
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoFile);
      const covers: string[] = [];

      video.onloadedmetadata = async () => {
        const duration = video.duration;
        const interval = duration / (count + 1);

        for (let i = 1; i <= count; i++) {
          const time = interval * i;
          video.currentTime = time;
          await new Promise<void>((res) => {
            video.onseeked = () => res();
          });

          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          covers.push(canvas.toDataURL('image/jpeg', 0.8));
        }

        URL.revokeObjectURL(url);
        resolve(covers);
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video'));
      };

      video.src = url;
    });
  }

  async resizeVideo(
    videoFile: File,
    targetWidth: number,
    targetHeight: number
  ): Promise<File> {
    return videoFile;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private drawWatermarkImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    config: WatermarkConfig,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const watermarkWidth = Math.min(canvasWidth * 0.2, img.width);
    const watermarkHeight = (watermarkWidth / img.width) * img.height;
    const margin = config.margin ?? 20;

    let x = margin;
    let y = margin;

    switch (config.position) {
      case 'topRight':
        x = canvasWidth - watermarkWidth - margin;
        break;
      case 'bottomLeft':
        y = canvasHeight - watermarkHeight - margin;
        break;
      case 'bottomRight':
        x = canvasWidth - watermarkWidth - margin;
        y = canvasHeight - watermarkHeight - margin;
        break;
      case 'center':
        x = (canvasWidth - watermarkWidth) / 2;
        y = (canvasHeight - watermarkHeight) / 2;
        break;
    }

    ctx.globalAlpha = config.opacity ?? 0.6;
    ctx.drawImage(img, x, y, watermarkWidth, watermarkHeight);
    ctx.globalAlpha = 1;
  }

  private drawWatermarkText(
    ctx: CanvasRenderingContext2D,
    text: string,
    config: WatermarkConfig,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const fontSize = config.fontSize ?? Math.floor(canvasWidth * 0.04);
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = config.color ?? 'rgba(255, 255, 255, 0.8)';
    ctx.globalAlpha = config.opacity ?? 0.8;

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const margin = config.margin ?? 20;

    let x = margin;
    let y = margin + textHeight;

    switch (config.position) {
      case 'topRight':
        x = canvasWidth - textWidth - margin;
        break;
      case 'bottomLeft':
        y = canvasHeight - margin;
        break;
      case 'bottomRight':
        x = canvasWidth - textWidth - margin;
        y = canvasHeight - margin;
        break;
      case 'center':
        x = (canvasWidth - textWidth) / 2;
        y = (canvasHeight + textHeight) / 2;
        break;
    }

    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  async applyWatermarkToImage(
    imageSrc: string,
    config: WatermarkConfig
  ): Promise<string> {
    const img = await this.loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    if (config.imageUrl) {
      const watermarkImg = await this.loadImage(config.imageUrl);
      this.drawWatermarkImage(ctx, watermarkImg, config, canvas.width, canvas.height);
    } else if (config.text) {
      this.drawWatermarkText(ctx, config.text, config, canvas.width, canvas.height);
    }

    return canvas.toDataURL('image/jpeg', 0.9);
  }

  destroy(): void {
    this.cleanupProcessing();
    this.canvas = null;
    this.ctx = null;
  }
}

export default VideoEditor;
