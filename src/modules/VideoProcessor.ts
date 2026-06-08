import {
  Draft,
  TextWatermarkConfig,
  ImageWatermarkConfig,
  CombinedWatermarkConfig,
  ProcessResult,
  UploadProgress,
  PublishResult
} from '../types';

import VideoEditor from './VideoEditor';
import UploadManager from './UploadManager';
import EventBus from '../core/EventBus';
import { generateId } from '../utils';

type ProcessStep = 'trim' | 'textWatermark' | 'imageWatermark' | 'cover' | 'all';

class VideoProcessor {
  private videoEditor: VideoEditor;
  private uploadManager: UploadManager;
  private eventBus: EventBus;

  private originalVideoFile: File | null = null;
  private processedVideoFile: File | null = null;
  private processedCoverImage: string = '';
  private processedDuration: number = 0;
  private processedWidth: number = 0;
  private processedHeight: number = 0;
  private processedSize: number = 0;

  private title: string = '';
  private description: string = '';
  private columnId: string = '';

  private trimStartTime: number = 0;
  private trimEndTime: number = 0;
  private textWatermark?: TextWatermarkConfig;
  private imageWatermark?: ImageWatermarkConfig;

  private isProcessed: boolean = false;
  private draftId: string | null = null;

  private coverTime: number = 0.5;
  private customCoverImage: string = '';

  constructor(
    videoEditor: VideoEditor,
    uploadManager: UploadManager,
    eventBus: EventBus
  ) {
    this.videoEditor = videoEditor;
    this.uploadManager = uploadManager;
    this.eventBus = eventBus;
  }

  setVideo(videoFile: File): void {
    this.originalVideoFile = videoFile;
    this.processedVideoFile = null;
    this.isProcessed = false;
    this.title = videoFile.name;
  }

  getVideoFile(): File | null {
    return this.processedVideoFile || this.originalVideoFile;
  }

  getOriginalVideoFile(): File | null {
    return this.originalVideoFile;
  }

  setTrim(startTime: number, endTime: number): void {
    this.trimStartTime = startTime;
    this.trimEndTime = endTime;
    this.isProcessed = false;
    this.processedVideoFile = null;
  }

  getTrim(): { startTime: number; endTime: number } {
    return {
      startTime: this.trimStartTime,
      endTime: this.trimEndTime
    };
  }

  setTextWatermark(config: TextWatermarkConfig | undefined): void {
    this.textWatermark = config;
    this.isProcessed = false;
    this.processedVideoFile = null;
  }

  getTextWatermark(): TextWatermarkConfig | undefined {
    return this.textWatermark;
  }

  setImageWatermark(config: ImageWatermarkConfig | undefined): void {
    this.imageWatermark = config;
    this.isProcessed = false;
    this.processedVideoFile = null;
  }

  getImageWatermark(): ImageWatermarkConfig | undefined {
    return this.imageWatermark;
  }

  setTitle(title: string): void {
    this.title = title;
  }

  getTitle(): string {
    return this.title;
  }

  setDescription(description: string): void {
    this.description = description;
  }

  getDescription(): string {
    return this.description;
  }

  setColumnId(columnId: string): void {
    this.columnId = columnId;
  }

  getColumnId(): string {
    return this.columnId;
  }

  setDraftId(draftId: string | null): void {
    this.draftId = draftId;
  }

  getDraftId(): string | null {
    return this.draftId;
  }

  async process(options?: {
    onStepProgress?: (step: ProcessStep, index: number, total: number) => void;
  }): Promise<ProcessResult> {
    if (!this.originalVideoFile) {
      throw new Error('No video file set');
    }

    if (this.isProcessed && this.processedVideoFile) {
      return {
        videoFile: this.processedVideoFile,
        coverImage: this.processedCoverImage,
        duration: this.processedDuration,
        width: this.processedWidth,
        height: this.processedHeight,
        size: this.processedSize,
        hasTrim: !!(this.trimStartTime || this.trimEndTime),
        hasTextWatermark: !!this.textWatermark,
        hasImageWatermark: !!this.imageWatermark
      };
    }

    const needsProcessing = !!(this.trimStartTime || this.trimEndTime ||
      this.textWatermark || this.imageWatermark);

    if (!needsProcessing) {
      let coverImage = this.customCoverImage;
      if (!coverImage) {
        coverImage = await this.videoEditor.generateCover(this.originalVideoFile, this.coverTime);
      }
      const video = document.createElement('video');
      const url = URL.createObjectURL(this.originalVideoFile);
      const originalFile = this.originalVideoFile;

      return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          this.processedVideoFile = originalFile;
          this.processedCoverImage = coverImage;
          this.processedDuration = video.duration;
          this.processedWidth = video.videoWidth;
          this.processedHeight = video.videoHeight;
          this.processedSize = originalFile.size;
          this.isProcessed = true;

          resolve({
            videoFile: originalFile,
            coverImage,
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            size: originalFile.size,
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

    const result = await this.videoEditor.processVideoFull(this.originalVideoFile, {
      trimStartTime: this.trimStartTime,
      trimEndTime: this.trimEndTime,
      textWatermark: this.textWatermark,
      imageWatermark: this.imageWatermark,
      coverTime: this.coverTime,
      customCoverImage: this.customCoverImage
    });

    this.processedVideoFile = result.videoFile;
    this.processedCoverImage = result.coverImage;
    this.processedDuration = result.duration;
    this.processedWidth = result.width;
    this.processedHeight = result.height;
    this.processedSize = result.size;
    this.isProcessed = true;

    return result;
  }

  isVideoProcessed(): boolean {
    return this.isProcessed;
  }

  getProcessResult(): ProcessResult | null {
    if (!this.isProcessed || !this.processedVideoFile) return null;

    return {
      videoFile: this.processedVideoFile,
      coverImage: this.processedCoverImage,
      duration: this.processedDuration,
      width: this.processedWidth,
      height: this.processedHeight,
      size: this.processedSize,
      hasTrim: !!(this.trimStartTime || this.trimEndTime),
      hasTextWatermark: !!this.textWatermark,
      hasImageWatermark: !!this.imageWatermark
    };
  }

  regenerateCover(time: number = 0.5): Promise<string> {
    const videoFile = this.processedVideoFile || this.originalVideoFile;
    if (!videoFile) {
      throw new Error('No video file set');
    }

    const combined: CombinedWatermarkConfig = {
      textWatermark: this.textWatermark,
      imageWatermark: this.imageWatermark
    };

    return this.videoEditor.generateCoverWithWatermark(videoFile, combined, time);
  }

  async publish(options?: {
    columnId?: string;
    onProgress?: (progress: UploadProgress) => void;
    deleteDraftOnSuccess?: boolean;
  }): Promise<PublishResult> {
    if (!this.originalVideoFile) {
      throw new Error('No video file to publish');
    }

    if (!this.isProcessed) {
      await this.process();
    }

    const videoFile = this.processedVideoFile || this.originalVideoFile;
    const columnId = options?.columnId || this.columnId;

    const result = await this.uploadManager.publishToColumn(videoFile, columnId, {
      title: this.title,
      description: this.description,
      coverImage: this.processedCoverImage,
      onProgress: options?.onProgress,
      draftId: this.draftId || undefined,
      deleteDraftOnSuccess: options?.deleteDraftOnSuccess
    });

    if (result.success && result.videoInfo) {
      result.videoInfo = {
        ...result.videoInfo,
        duration: this.processedDuration,
        width: this.processedWidth,
        height: this.processedHeight,
        size: this.processedSize || videoFile.size,
        coverUrl: this.processedCoverImage
      };
    }

    return result;
  }

  async saveAsDraft(draftId?: string): Promise<Draft> {
    const draftData: Omit<Draft, 'draftId' | 'createdAt' | 'updatedAt'> = {
      title: this.title || '未命名草稿',
      description: this.description,
      videoFile: this.originalVideoFile,
      coverImage: this.processedCoverImage || undefined,
      duration: this.processedDuration || undefined,
      width: this.processedWidth || undefined,
      height: this.processedHeight || undefined,
      size: this.originalVideoFile?.size,
      trimStartTime: this.trimStartTime || undefined,
      trimEndTime: this.trimEndTime || undefined,
      textWatermark: this.textWatermark,
      imageWatermark: this.imageWatermark,
      columnId: this.columnId || undefined,
      processedVideoFile: this.processedVideoFile,
      processedCoverImage: this.processedCoverImage || undefined,
      processedDuration: this.processedDuration || undefined,
      processedWidth: this.processedWidth || undefined,
      processedHeight: this.processedHeight || undefined,
      processedSize: this.processedSize || undefined,
      isProcessed: this.isProcessed
    };

    if (draftId) {
      const existing = this.uploadManager.getDraft(draftId);
      if (existing) {
        const updated = await this.uploadManager.updateDraft(draftId, draftData);
        if (updated) {
          this.draftId = draftId;
          return updated;
        }
      }
    }

    const draft = await this.uploadManager.saveDraft(draftData);
    this.draftId = draft.draftId;
    return draft;
  }

  async loadFromDraft(draft: Draft, videoFile?: File): Promise<void> {
    this.draftId = draft.draftId;
    this.title = draft.title || '';
    this.description = draft.description || '';
    this.columnId = draft.columnId || '';
    this.trimStartTime = draft.trimStartTime || 0;
    this.trimEndTime = draft.trimEndTime || 0;
    this.textWatermark = draft.textWatermark;
    this.imageWatermark = draft.imageWatermark;
    this.coverTime = draft.coverTime ?? 0.5;
    this.customCoverImage = draft.customCoverImage || '';

    const hasNewVideo = !!videoFile;
    const hasDraftVideo = !!draft.videoFile;

    if (videoFile) {
      this.originalVideoFile = videoFile;
    } else if (draft.videoFile) {
      this.originalVideoFile = draft.videoFile;
    } else {
      this.originalVideoFile = null;
    }

    const processedVideoAvailable = !!(draft.isProcessed && draft.processedVideoFile);
    const needsReprocess = hasNewVideo || !processedVideoAvailable;

    if (processedVideoAvailable && !needsReprocess) {
      this.processedVideoFile = draft.processedVideoFile!;
      this.processedCoverImage = draft.processedCoverImage || '';
      this.processedDuration = draft.processedDuration || 0;
      this.processedWidth = draft.processedWidth || 0;
      this.processedHeight = draft.processedHeight || 0;
      this.processedSize = draft.processedSize || 0;
      this.isProcessed = true;
    } else {
      this.processedVideoFile = null;
      this.processedCoverImage = '';
      this.processedDuration = 0;
      this.processedWidth = 0;
      this.processedHeight = 0;
      this.processedSize = 0;
      this.isProcessed = false;
    }
  }

  hasVideoFile(): boolean {
    return this.originalVideoFile !== null;
  }

  reset(): void {
    this.originalVideoFile = null;
    this.processedVideoFile = null;
    this.processedCoverImage = '';
    this.processedDuration = 0;
    this.processedWidth = 0;
    this.processedHeight = 0;
    this.processedSize = 0;
    this.title = '';
    this.description = '';
    this.columnId = '';
    this.trimStartTime = 0;
    this.trimEndTime = 0;
    this.textWatermark = undefined;
    this.imageWatermark = undefined;
    this.isProcessed = false;
    this.draftId = null;
  }

  destroy(): void {
    this.reset();
  }
}

export default VideoProcessor;
