import { WatermarkConfig, EditResult } from '../types';
import { generateVideoThumbnail, generateId } from '../utils';

class VideoEditor {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

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
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoFile);

      video.onloadedmetadata = async () => {
        try {
          const result = await this.processWithWatermark(
            video,
            videoFile,
            watermarkConfig
          );
          URL.revokeObjectURL(url);
          resolve(result);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video'));
      };

      video.src = url;
    });
  }

  private async processWithWatermark(
    video: HTMLVideoElement,
    originalFile: File,
    config: WatermarkConfig
  ): Promise<EditResult> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Cannot get canvas context');
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (config.imageUrl) {
      const watermarkImage = await this.loadImage(config.imageUrl);
      const coverCanvas = document.createElement('canvas');
      coverCanvas.width = canvas.width;
      coverCanvas.height = canvas.height;
      const coverCtx = coverCanvas.getContext('2d')!;

      video.currentTime = 1;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      coverCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
      this.drawWatermarkImage(coverCtx, watermarkImage, config, canvas.width, canvas.height);

      const coverImage = coverCanvas.toDataURL('image/jpeg', 0.85);

      return {
        videoFile: originalFile,
        coverImage,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        watermarkApplied: false
      };
    }

    const coverCanvas = document.createElement('canvas');
    coverCanvas.width = canvas.width;
    coverCanvas.height = canvas.height;
    const coverCtx = coverCanvas.getContext('2d')!;

    video.currentTime = 1;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    coverCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
    this.drawWatermarkText(coverCtx, config.text || '', config, canvas.width, canvas.height);

    const coverImage = coverCanvas.toDataURL('image/jpeg', 0.85);

    return {
      videoFile: originalFile,
      coverImage,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      watermarkApplied: false
    };
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

  async trimVideo(
    videoFile: File,
    startTime: number,
    endTime: number
  ): Promise<{ videoFile: File; duration: number }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoFile);

      video.onloadedmetadata = () => {
        resolve({
          videoFile,
          duration: endTime - startTime
        });
        URL.revokeObjectURL(url);
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
    this.canvas = null;
    this.ctx = null;
  }
}

export default VideoEditor;
