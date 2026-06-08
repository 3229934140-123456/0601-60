import {
  WatermarkConfig,
  TextWatermarkConfig,
  ImageWatermarkConfig,
  CombinedWatermarkConfig,
  EditResult,
  ProcessResult
} from '../types';
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
    const combined: CombinedWatermarkConfig = {};
    if (watermarkConfig.text) {
      combined.textWatermark = {
        text: watermarkConfig.text,
        position: watermarkConfig.position,
        opacity: watermarkConfig.opacity,
        fontSize: watermarkConfig.fontSize,
        color: watermarkConfig.color,
        margin: watermarkConfig.margin
      };
    }
    if (watermarkConfig.imageUrl) {
      combined.imageWatermark = {
        imageUrl: watermarkConfig.imageUrl,
        position: watermarkConfig.position,
        opacity: watermarkConfig.opacity,
        margin: watermarkConfig.margin
      };
    }

    return this.processVideo(videoFile, {
      watermark: combined,
      startTime: 0,
      endTime: 0
    }).then(result => ({
      ...result,
      watermarkApplied: !!(combined.textWatermark || combined.imageWatermark)
    }));
  }

  async addTextWatermark(
    videoFile: File,
    config: TextWatermarkConfig
  ): Promise<EditResult> {
    return this.processVideo(videoFile, {
      watermark: { textWatermark: config },
      startTime: 0,
      endTime: 0
    }).then(result => ({
      ...result,
      watermarkApplied: true
    }));
  }

  async addImageWatermark(
    videoFile: File,
    config: ImageWatermarkConfig
  ): Promise<EditResult> {
    return this.processVideo(videoFile, {
      watermark: { imageWatermark: config },
      startTime: 0,
      endTime: 0
    }).then(result => ({
      ...result,
      watermarkApplied: true
    }));
  }

  async addCombinedWatermark(
    videoFile: File,
    config: CombinedWatermarkConfig
  ): Promise<EditResult> {
    return this.processVideo(videoFile, {
      watermark: config,
      startTime: 0,
      endTime: 0
    }).then(result => ({
      ...result,
      watermarkApplied: !!(config.textWatermark || config.imageWatermark)
    }));
  }

  async trimVideo(
    videoFile: File,
    startTime: number,
    endTime: number
  ): Promise<{ videoFile: File; duration: number; coverImage: string; width: number; height: number; size: number }> {
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
      height: result.height,
      size: result.size
    };
  }

  async processVideoFull(
    videoFile: File,
    options: {
      trimStartTime?: number;
      trimEndTime?: number;
      textWatermark?: TextWatermarkConfig;
      imageWatermark?: ImageWatermarkConfig;
    }
  ): Promise<ProcessResult> {
    const watermark: CombinedWatermarkConfig = {
      textWatermark: options.textWatermark,
      imageWatermark: options.imageWatermark
    };

    const hasWatermark = !!(watermark.textWatermark || watermark.imageWatermark);
    const hasTrim = !!(options.trimStartTime || options.trimEndTime);

    if (!hasWatermark && !hasTrim) {
      const coverImage = await this.generateCover(videoFile, 0.5);
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoFile);

      return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve({
            videoFile,
            coverImage,
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            size: videoFile.size,
            hasTrim: false,
            hasTextWatermark: false,
            hasImageWatermark: false
          });
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load video'));
        };
        video.src = url;
      });
    }

    const result = await this.processVideo(videoFile, {
      startTime: options.trimStartTime || 0,
      endTime: options.trimEndTime || 0,
      watermark
    });

    return {
      videoFile: result.videoFile,
      coverImage: result.coverImage,
      duration: result.duration,
      width: result.width,
      height: result.height,
      size: result.size,
      hasTrim,
      hasTextWatermark: !!watermark.textWatermark,
      hasImageWatermark: !!watermark.imageWatermark
    };
  }

  private async processVideo(
    videoFile: File,
    options: {
      watermark: CombinedWatermarkConfig | null;
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
      const endTime = options.endTime && options.endTime > 0
        ? Math.min(options.endTime, totalDuration)
        : totalDuration;
      const targetDuration = endTime - startTime;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      let imageWatermarkImg: HTMLImageElement | null = null;
      if (options.watermark?.imageWatermark) {
        imageWatermarkImg = await this.loadImage(options.watermark.imageWatermark.imageUrl);
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

        if (options.watermark && (options.watermark.textWatermark || options.watermark.imageWatermark)) {
          this.drawCombinedWatermark(
            ctx,
            width,
            height,
            options.watermark,
            imageWatermarkImg
          );
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

      const coverImage = await this.generateCoverWithWatermark(
        processedFile,
        options.watermark || undefined,
        0.5
      );

      URL.revokeObjectURL(videoUrl);

      return {
        videoFile: processedFile,
        coverImage,
        duration: targetDuration,
        width,
        height,
        size: processedFile.size,
        watermarkApplied: !!(options.watermark?.textWatermark || options.watermark?.imageWatermark)
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

  async generateCoverWithWatermark(
    videoFile: File,
    watermarkConfig: CombinedWatermarkConfig | undefined,
    time: number = 1
  ): Promise<string> {
    const url = URL.createObjectURL(videoFile);

    try {
      const video = document.createElement('video');
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = reject;
      });

      video.currentTime = Math.min(time, video.duration);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (watermarkConfig && (watermarkConfig.textWatermark || watermarkConfig.imageWatermark)) {
        let watermarkImg: HTMLImageElement | null = null;
        if (watermarkConfig.imageWatermark) {
          try {
            watermarkImg = await this.loadImage(watermarkConfig.imageWatermark.imageUrl);
          } catch (e) {}
        }
        this.drawCombinedWatermark(ctx, canvas.width, canvas.height, watermarkConfig, watermarkImg);
      }

      URL.revokeObjectURL(url);
      return canvas.toDataURL('image/jpeg', 0.85);
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

  private drawImageWatermark(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    config: ImageWatermarkConfig,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    let watermarkWidth: number;
    let watermarkHeight: number;

    if (config.width) {
      watermarkWidth = config.width;
      watermarkHeight = config.height || (watermarkWidth / img.width) * img.height;
    } else if (config.height) {
      watermarkHeight = config.height;
      watermarkWidth = (watermarkHeight / img.height) * img.width;
    } else {
      watermarkWidth = Math.min(canvasWidth * 0.2, img.width);
      watermarkHeight = (watermarkWidth / img.width) * img.height;
    }

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

  private drawTextWatermark(
    ctx: CanvasRenderingContext2D,
    config: TextWatermarkConfig,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const fontSize = config.fontSize ?? Math.floor(canvasWidth * 0.04);
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = config.color ?? 'rgba(255, 255, 255, 0.8)';
    ctx.globalAlpha = config.opacity ?? 0.8;

    const metrics = ctx.measureText(config.text);
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

    ctx.fillText(config.text, x, y);
    ctx.globalAlpha = 1;
  }

  private drawCombinedWatermark(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    config: CombinedWatermarkConfig,
    imageImg: HTMLImageElement | null
  ): void {
    const textConfig = config.textWatermark;
    const imageConfig = config.imageWatermark;

    if (!textConfig && !imageConfig) return;

    if (textConfig && imageConfig) {
      const textPos = textConfig.position || 'bottomRight';
      const imagePos = imageConfig.position || 'bottomRight';

      if (textPos === imagePos) {
        this.drawStackedWatermark(
          ctx,
          canvasWidth,
          canvasHeight,
          imageConfig,
          imageImg,
          textConfig,
          textPos
        );
        return;
      }
    }

    if (imageConfig && imageImg) {
      this.drawImageWatermark(ctx, imageImg, imageConfig, canvasWidth, canvasHeight);
    }
    if (textConfig) {
      this.drawTextWatermark(ctx, textConfig, canvasWidth, canvasHeight);
    }
  }

  private drawStackedWatermark(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    imageConfig: ImageWatermarkConfig,
    imageImg: HTMLImageElement | null,
    textConfig: TextWatermarkConfig,
    position: string
  ): void {
    const margin = imageConfig.margin ?? textConfig.margin ?? 20;
    const gap = 8;

    let imgWidth = 0;
    let imgHeight = 0;
    if (imageImg) {
      if (imageConfig.width) {
        imgWidth = imageConfig.width;
        imgHeight = imageConfig.height || (imgWidth / imageImg.width) * imageImg.height;
      } else if (imageConfig.height) {
        imgHeight = imageConfig.height;
        imgWidth = (imgHeight / imageImg.height) * imageImg.width;
      } else {
        imgWidth = Math.min(canvasWidth * 0.2, imageImg.width);
        imgHeight = (imgWidth / imageImg.width) * imageImg.height;
      }
    }

    const fontSize = textConfig.fontSize ?? Math.floor(canvasWidth * 0.04);
    ctx.font = `${fontSize}px Arial, sans-serif`;
    const textMetrics = ctx.measureText(textConfig.text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;

    const totalWidth = Math.max(imgWidth, textWidth);
    const totalHeight = imgHeight + (imgHeight > 0 ? gap : 0) + textHeight;

    let x = margin;
    let y = margin;

    switch (position) {
      case 'topLeft':
        x = margin;
        y = margin;
        break;
      case 'topRight':
        x = canvasWidth - totalWidth - margin;
        y = margin;
        break;
      case 'bottomLeft':
        x = margin;
        y = canvasHeight - totalHeight - margin;
        break;
      case 'bottomRight':
        x = canvasWidth - totalWidth - margin;
        y = canvasHeight - totalHeight - margin;
        break;
      case 'center':
        x = (canvasWidth - totalWidth) / 2;
        y = (canvasHeight - totalHeight) / 2;
        break;
    }

    let imgX = x;
    let textX = x;

    if (imgWidth < totalWidth) {
      imgX = x + (totalWidth - imgWidth) / 2;
    }
    if (textWidth < totalWidth) {
      textX = x + (totalWidth - textWidth) / 2;
    }

    if (imageImg && imgWidth > 0 && imgHeight > 0) {
      ctx.globalAlpha = imageConfig.opacity ?? 0.6;
      ctx.drawImage(imageImg, imgX, y, imgWidth, imgHeight);
      ctx.globalAlpha = 1;
    }

    const textY = y + imgHeight + (imgHeight > 0 ? gap : 0) + textHeight;
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = textConfig.color ?? 'rgba(255, 255, 255, 0.8)';
    ctx.globalAlpha = textConfig.opacity ?? 0.8;
    ctx.fillText(textConfig.text, textX, textY);
    ctx.globalAlpha = 1;
  }

  async applyWatermarkToImage(
    imageSrc: string,
    config: WatermarkConfig | CombinedWatermarkConfig
  ): Promise<string> {
    const img = await this.loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    const combined = config as CombinedWatermarkConfig;
    const legacy = config as WatermarkConfig;

    let watermarkConfig: CombinedWatermarkConfig = {};
    let watermarkImg: HTMLImageElement | null = null;

    if (combined.textWatermark || combined.imageWatermark) {
      watermarkConfig = combined;
      if (combined.imageWatermark) {
        try {
          watermarkImg = await this.loadImage(combined.imageWatermark.imageUrl);
        } catch (e) {}
      }
    } else if (legacy.text || legacy.imageUrl) {
      if (legacy.imageUrl) {
        try {
          watermarkImg = await this.loadImage(legacy.imageUrl);
          watermarkConfig.imageWatermark = {
            imageUrl: legacy.imageUrl,
            position: legacy.position,
            opacity: legacy.opacity,
            margin: legacy.margin
          };
        } catch (e) {}
      }
      if (legacy.text) {
        watermarkConfig.textWatermark = {
          text: legacy.text,
          position: legacy.position,
          opacity: legacy.opacity,
          fontSize: legacy.fontSize,
          color: legacy.color,
          margin: legacy.margin
        };
      }
    }

    if (watermarkConfig.textWatermark || watermarkConfig.imageWatermark) {
      this.drawCombinedWatermark(ctx, canvas.width, canvas.height, watermarkConfig, watermarkImg);
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
