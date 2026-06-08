import EventBus from '../core/EventBus';
import { generateId, readFileAsDataURL, getVideoDimensions, generateVideoThumbnail } from '../utils';

export interface VideoSelectOptions {
  multiple?: boolean;
  accept?: string;
  maxSize?: number;
  maxDuration?: number;
  onSelect?: (files: File[]) => void;
  onError?: (error: string) => void;
}

export interface SelectedVideo {
  file: File;
  name: string;
  size: number;
  type: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  url: string;
}

class VideoPicker {
  private eventBus: EventBus;
  private inputElement: HTMLInputElement | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async selectVideo(options: VideoSelectOptions = {}): Promise<SelectedVideo[]> {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Document is not available'));
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = options.accept || 'video/*';
      input.multiple = options.multiple || false;
      input.style.display = 'none';

      input.onchange = async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) {
          reject(new Error('No video selected'));
          return;
        }

        try {
          const videoFiles = Array.from(files);

          if (options.maxSize) {
            for (const file of videoFiles) {
              if (file.size > options.maxSize) {
                const error = `Video "${file.name}" exceeds maximum size of ${options.maxSize} bytes`;
                options.onError?.(error);
                reject(new Error(error));
                return;
              }
            }
          }

          const selectedVideos: SelectedVideo[] = [];

          for (const file of videoFiles) {
            const url = URL.createObjectURL(file);
            const video: SelectedVideo = {
              file,
              name: file.name,
              size: file.size,
              type: file.type,
              url
            };

            try {
              const dims = await getVideoDimensions(url);
              video.width = dims.width;
              video.height = dims.height;
            } catch (e) {
            }

            try {
              const thumb = await generateVideoThumbnail(url, 1);
              video.thumbnail = thumb;
            } catch (e) {
            }

            selectedVideos.push(video);
          }

          options.onSelect?.(videoFiles);
          resolve(selectedVideos);
        } catch (error: any) {
          options.onError?.(error.message);
          reject(error);
        } finally {
          document.body.removeChild(input);
          this.inputElement = null;
        }
      };

      input.onerror = () => {
        const error = 'Failed to select video';
        options.onError?.(error);
        reject(new Error(error));
        document.body.removeChild(input);
        this.inputElement = null;
      };

      document.body.appendChild(input);
      this.inputElement = input;
      input.click();
    });
  }

  async generateThumbnail(videoUrl: string, time: number = 0): Promise<string> {
    return generateVideoThumbnail(videoUrl, time);
  }

  getVideoInfo(file: File): Promise<{ width: number; height: number; duration: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');

      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration
        });
        URL.revokeObjectURL(url);
      };

      video.onerror = () => {
        reject(new Error('Failed to load video metadata'));
        URL.revokeObjectURL(url);
      };

      video.src = url;
    });
  }

  destroy(): void {
    if (this.inputElement && this.inputElement.parentNode) {
      this.inputElement.parentNode.removeChild(this.inputElement);
      this.inputElement = null;
    }
  }
}

export default VideoPicker;
