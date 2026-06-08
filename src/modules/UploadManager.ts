import { UploadConfig, UploadProgress, Draft, VideoInfo, PublishResult } from '../types';
import EventBus from '../core/EventBus';
import { generateId } from '../utils';

const defaultUploadConfig: UploadConfig = {
  uploadUrl: '',
  chunkSize: 2 * 1024 * 1024,
  maxRetries: 3,
  headers: {}
};

class UploadManager {
  private config: UploadConfig;
  private eventBus: EventBus;
  private uploads: Map<string, {
    file: File;
    xhr: XMLHttpRequest;
    abortController?: AbortController;
    progress: UploadProgress;
  }> = new Map();
  private drafts: Map<string, Draft> = new Map();
  private draftsStorageKey = 'edu_shortvideo_drafts';

  constructor(config: UploadConfig, eventBus: EventBus) {
    this.config = { ...defaultUploadConfig, ...config };
    this.eventBus = eventBus;
    this.loadDrafts();
  }

  setConfig(config: Partial<UploadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async uploadVideo(
    videoFile: File,
    options: {
      videoId?: string;
      onProgress?: (progress: UploadProgress) => void;
      columnId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<{ videoId: string; videoUrl: string }> {
    const videoId = options.videoId || generateId('video');

    this.eventBus.emit('uploadStart', {
      videoId,
      fileName: videoFile.name
    });

    if (!this.config.uploadUrl) {
      return new Promise((resolve) => {
        let loaded = 0;
        const total = videoFile.size;
        const startTime = Date.now();

        const interval = setInterval(() => {
          loaded = Math.min(loaded + Math.floor(total * 0.1), total);
          const percent = Math.round((loaded / total) * 100);
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = loaded / (elapsed || 1);

          const progress: UploadProgress = {
            loaded,
            total,
            percent,
            speed,
            videoId
          };

          options.onProgress?.(progress);
          this.eventBus.emit('uploadProgress', progress);

          if (loaded >= total) {
            clearInterval(interval);
            this.eventBus.emit('uploadComplete', {
              videoId,
              videoUrl: `blob://${videoId}`
            });
            resolve({ videoId, videoUrl: `blob://${videoId}` });
          }
        }, 200);
      });
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();
      let lastLoaded = 0;

      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('videoId', videoId);
      if (options.columnId) {
        formData.append('columnId', options.columnId);
      }
      if (options.metadata) {
        formData.append('metadata', JSON.stringify(options.metadata));
      }

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = e.loaded / (elapsed || 1);

          const progress: UploadProgress = {
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
            speed,
            videoId
          };

          options.onProgress?.(progress);
          this.eventBus.emit('uploadProgress', progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            this.eventBus.emit('uploadComplete', {
              videoId,
              videoUrl: response.videoUrl || response.url
            });
            this.uploads.delete(videoId);
            resolve({
              videoId,
              videoUrl: response.videoUrl || response.url
            });
          } catch (e) {
            this.eventBus.emit('uploadComplete', {
              videoId,
              videoUrl: xhr.responseText
            });
            this.uploads.delete(videoId);
            resolve({ videoId, videoUrl: xhr.responseText });
          }
        } else {
          const error = `Upload failed with status ${xhr.status}`;
          this.eventBus.emit('uploadError', { videoId, error });
          this.uploads.delete(videoId);
          reject(new Error(error));
        }
      });

      xhr.addEventListener('error', () => {
        const error = 'Upload failed due to network error';
        this.eventBus.emit('uploadError', { videoId, error });
        this.uploads.delete(videoId);
        reject(new Error(error));
      });

      xhr.addEventListener('abort', () => {
        this.uploads.delete(videoId);
        reject(new Error('Upload aborted'));
      });

      xhr.open('POST', this.config.uploadUrl);

      if (this.config.headers) {
        Object.entries(this.config.headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
      }

      this.uploads.set(videoId, {
        file: videoFile,
        xhr,
        progress: {
          loaded: 0,
          total: videoFile.size,
          percent: 0,
          speed: 0,
          videoId
        }
      });

      xhr.send(formData);
    });
  }

  async uploadWithProgress(
    videoFile: File,
    options: {
      videoId?: string;
      columnId?: string;
      title?: string;
      description?: string;
      coverImage?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<PublishResult> {
    try {
      const { videoId, videoUrl } = await this.uploadVideo(videoFile, {
        videoId: options.videoId,
        columnId: options.columnId,
        metadata: options.metadata
      });

      const videoInfo: VideoInfo = {
        videoId,
        title: options.title || videoFile.name,
        description: options.description,
        coverUrl: options.coverImage || '',
        videoUrl,
        duration: 0,
        width: 0,
        height: 0,
        size: videoFile.size,
        category: options.columnId,
        columnId: options.columnId,
        likes: 0,
        favorites: 0,
        comments: 0,
        views: 0,
        createdAt: Date.now()
      };

      this.eventBus.emit('publishSuccess', { videoId, videoInfo });

      return {
        success: true,
        videoId,
        videoInfo
      };
    } catch (error: any) {
      this.eventBus.emit('publishError', {
        videoId: options.videoId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  async publishToColumn(
    videoFile: File,
    columnId: string,
    options: {
      title?: string;
      description?: string;
      coverImage?: string;
      onProgress?: (progress: UploadProgress) => void;
    } = {}
  ): Promise<PublishResult> {
    return this.uploadWithProgress(videoFile, {
      columnId,
      title: options.title,
      description: options.description,
      coverImage: options.coverImage,
    });
  }

  cancelUpload(videoId: string): boolean {
    const upload = this.uploads.get(videoId);
    if (upload) {
      upload.xhr.abort();
      this.uploads.delete(videoId);
      return true;
    }
    return false;
  }

  cancelAllUploads(): void {
    this.uploads.forEach((upload) => {
      upload.xhr.abort();
    });
    this.uploads.clear();
  }

  getUploadProgress(videoId: string): UploadProgress | null {
    const upload = this.uploads.get(videoId);
    return upload ? { ...upload.progress } : null;
  }

  async saveDraft(draft: Omit<Draft, 'draftId' | 'createdAt' | 'updatedAt'>): Promise<Draft> {
    const now = Date.now();
    const newDraft = {
      ...draft,
      draftId: generateId('draft'),
      createdAt: now,
      updatedAt: now
    } as Draft;

    this.drafts.set(newDraft.draftId, newDraft);
    this.saveDrafts();
    this.eventBus.emit('draftSave', newDraft);

    return newDraft;
  }

  async updateDraft(draftId: string, updates: Partial<Draft>): Promise<Draft | null> {
    const draft = this.drafts.get(draftId);
    if (!draft) return null;

    const updatedDraft: Draft = {
      ...draft,
      ...updates,
      draftId,
      updatedAt: Date.now()
    };

    this.drafts.set(draftId, updatedDraft);
    this.saveDrafts();
    this.eventBus.emit('draftSave', updatedDraft);

    return updatedDraft;
  }

  getDraft(draftId: string): Draft | null {
    const draft = this.drafts.get(draftId);
    return draft ? { ...draft } : null;
  }

  getDrafts(): Draft[] {
    return Array.from(this.drafts.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(draft => ({ ...draft }));
  }

  deleteDraft(draftId: string): boolean {
    const deleted = this.drafts.delete(draftId);
    if (deleted) {
      this.saveDrafts();
      this.eventBus.emit('draftDelete', { draftId });
    }
    return deleted;
  }

  clearDrafts(): void {
    this.drafts.clear();
    this.saveDrafts();
  }

  private saveDrafts(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const draftsData = Array.from(this.drafts.values()).map(draft => {
          const { videoFile, ...rest } = draft;
          return rest;
        });
        localStorage.setItem(this.draftsStorageKey, JSON.stringify(draftsData));
      }
    } catch (e) {
      console.warn('[EduShortVideo SDK] Failed to save drafts:', e);
    }
  }

  private loadDrafts(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.draftsStorageKey);
        if (stored) {
          const draftsData = JSON.parse(stored);
          draftsData.forEach((draft: Draft) => {
            this.drafts.set(draft.draftId, { ...draft, videoFile: null });
          });
        }
      }
    } catch (e) {
      console.warn('[EduShortVideo SDK] Failed to load drafts:', e);
    }
  }

  destroy(): void {
    this.cancelAllUploads();
    this.drafts.clear();
  }
}

export default UploadManager;
