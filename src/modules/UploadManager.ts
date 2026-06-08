import { UploadConfig, UploadProgress, UploadTaskType, UploadTaskInfo, Draft, DraftStatus, DraftDetail, VideoInfo, PublishResult } from '../types';
import EventBus from '../core/EventBus';
import { generateId } from '../utils';

const defaultUploadConfig: UploadConfig = {
  uploadUrl: '',
  chunkSize: 2 * 1024 * 1024,
  maxRetries: 3,
  headers: {}
};

interface UploadTask {
    file: File;
    xhr?: XMLHttpRequest;
    mockTimer?: ReturnType<typeof setInterval>;
    progress: UploadProgress;
    type: UploadTaskType;
    columnId?: string;
    draftId?: string;
    title?: string;
  }

class UploadManager {
  private config: UploadConfig;
  private eventBus: EventBus;
  private uploads: Map<string, UploadTask> = new Map();
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
      type?: UploadTaskType;
      draftId?: string;
      title?: string;
    } = {}
  ): Promise<{ videoId: string; videoUrl: string }> {
    const videoId = options.videoId || generateId('video');

    const initialProgress: UploadProgress = {
      loaded: 0,
      total: videoFile.size,
      percent: 0,
      speed: 0,
      videoId
    };

    const uploadTask: UploadTask = {
      file: videoFile,
      progress: initialProgress,
      type: options.type || 'upload',
      columnId: options.columnId,
      draftId: options.draftId,
      title: options.title
    };
    this.uploads.set(videoId, uploadTask);

    this.eventBus.emit('uploadStart', {
      videoId,
      fileName: videoFile.name
    });

    options.onProgress?.(initialProgress);
    this.eventBus.emit('uploadProgress', initialProgress);

    const updateProgress = (progress: UploadProgress) => {
      uploadTask.progress = progress;
      this.uploads.set(videoId, uploadTask);
      options.onProgress?.(progress);
      this.eventBus.emit('uploadProgress', progress);
    };

    const finishUpload = (videoUrl: string) => {
      const finalProgress: UploadProgress = {
        loaded: videoFile.size,
        total: videoFile.size,
        percent: 100,
        speed: 0,
        videoId
      };
      uploadTask.progress = finalProgress;
      this.uploads.set(videoId, uploadTask);
      options.onProgress?.(finalProgress);
      this.eventBus.emit('uploadProgress', finalProgress);

      this.uploads.delete(videoId);

      this.eventBus.emit('uploadComplete', {
        videoId,
        videoUrl
      });
    };

    if (!this.config.uploadUrl) {
      return new Promise((resolve, reject) => {
        let loaded = 0;
        const total = videoFile.size;
        const startTime = Date.now();

        const interval = setInterval(() => {
          loaded = Math.min(loaded + Math.floor(total * 0.05), total);
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

          updateProgress(progress);

          if (loaded >= total) {
            clearInterval(interval);
            uploadTask.mockTimer = undefined;
            finishUpload(`blob://${videoId}`);
            resolve({ videoId, videoUrl: `blob://${videoId}` });
          }
        }, 200);

        uploadTask.mockTimer = interval;
        this.uploads.set(videoId, uploadTask);
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

          updateProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            const videoUrl = response.videoUrl || response.url || xhr.responseText;
            finishUpload(videoUrl);
            resolve({ videoId, videoUrl });
          } catch (e) {
            const videoUrl = xhr.responseText;
            finishUpload(videoUrl);
            resolve({ videoId, videoUrl });
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

      uploadTask.xhr = xhr;
      this.uploads.set(videoId, uploadTask);

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
      onProgress?: (progress: UploadProgress) => void;
      draftId?: string;
      deleteDraftOnSuccess?: boolean;
      type?: UploadTaskType;
    } = {}
  ): Promise<PublishResult> {
    try {
      const { videoId, videoUrl } = await this.uploadVideo(videoFile, {
        videoId: options.videoId,
        columnId: options.columnId,
        metadata: options.metadata,
        onProgress: options.onProgress,
        type: options.type || 'publish',
        draftId: options.draftId,
        title: options.title
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

      if (options.draftId && options.deleteDraftOnSuccess !== false) {
        this.deleteDraft(options.draftId);
      }

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
      draftId?: string;
      deleteDraftOnSuccess?: boolean;
      type?: UploadTaskType;
    } = {}
  ): Promise<PublishResult> {
    return this.uploadWithProgress(videoFile, {
      columnId,
      title: options.title,
      description: options.description,
      coverImage: options.coverImage,
      onProgress: options.onProgress,
      draftId: options.draftId,
      deleteDraftOnSuccess: options.deleteDraftOnSuccess,
      type: options.type || 'publish'
    });
  }

  cancelUpload(videoId: string): boolean {
    const upload = this.uploads.get(videoId);
    if (upload) {
      if (upload.xhr) {
        upload.xhr.abort();
      }
      if (upload.mockTimer) {
        clearInterval(upload.mockTimer);
      }
      this.uploads.delete(videoId);
      return true;
    }
    return false;
  }

  cancelAllUploads(): void {
    this.uploads.forEach((upload) => {
      if (upload.xhr) {
        upload.xhr.abort();
      }
      if (upload.mockTimer) {
        clearInterval(upload.mockTimer);
      }
    });
    this.uploads.clear();
  }

  getUploadProgress(videoId: string): UploadProgress | null {
    const upload = this.uploads.get(videoId);
    return upload ? { ...upload.progress } : null;
  }

  getUploadTasks(type?: UploadTaskType): UploadTaskInfo[] {
    let tasks = Array.from(this.uploads.values());

    if (type) {
      tasks = tasks.filter(t => t.type === type);
    }

    return tasks.map(task => ({
      videoId: task.progress.videoId || '',
      fileName: task.file.name,
      fileSize: task.file.size,
      type: task.type,
      progress: { ...task.progress },
      columnId: task.columnId,
      draftId: task.draftId,
      title: task.title
    }));
  }

  getUploadTaskCount(): number {
    return this.uploads.size;
  }

  async saveDraft(draft: Omit<Draft, 'draftId' | 'createdAt' | 'updatedAt'>): Promise<Draft> {
    const now = Date.now();

    let status: DraftStatus = 'pending';
    if (draft.isProcessed && draft.processedVideoFile) {
      status = 'processed';
    }
    if (draft.status) {
      status = draft.status;
    }

    const newDraft = {
      ...draft,
      draftId: generateId('draft'),
      createdAt: now,
      updatedAt: now,
      status
    } as Draft;

    this.drafts.set(newDraft.draftId, newDraft);
    this.saveDrafts();
    this.eventBus.emit('draftSave', newDraft);

    return newDraft;
  }

  async updateDraft(draftId: string, updates: Partial<Draft>): Promise<Draft | null> {
    const draft = this.drafts.get(draftId);
    if (!draft) return null;

    let status: DraftStatus | undefined = undefined;
    if (updates.isProcessed !== undefined) {
      status = updates.isProcessed ? 'processed' : 'pending';
    }
    if (updates.status) {
      status = updates.status;
    }

    const updatedDraft: Draft = {
      ...draft,
      ...updates,
      status: status ?? draft.status,
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

  getDraftDetail(draftId: string): DraftDetail | null {
    const draft = this.getDraft(draftId);
    if (!draft) return null;

    const videoAvailable = !!draft.videoFile;
    const processedVideoAvailable = !!(draft.isProcessed && draft.processedVideoFile);
    const canPublish = videoAvailable;

    return {
      ...draft,
      videoAvailable,
      processedVideoAvailable,
      canPublish
    };
  }

  getDrafts(status?: DraftStatus): Draft[] {
    let drafts = Array.from(this.drafts.values());

    if (status) {
      drafts = drafts.filter(d => d.status === status);
    }

    return drafts
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(draft => ({ ...draft }));
  }

  getDraftCounts(): { pending: number; processed: number; publishFailed: number; total: number } {
    let pending = 0;
    let processed = 0;
    let publishFailed = 0;

    this.drafts.forEach(draft => {
      switch (draft.status) {
        case 'processed':
          processed++;
          break;
        case 'publishFailed':
          publishFailed++;
          break;
        default:
          pending++;
      }
    });

    return {
      pending,
      processed,
      publishFailed,
      total: this.drafts.size
    };
  }

  setDraftStatus(draftId: string, status: DraftStatus, failReason?: string): boolean {
    const draft = this.drafts.get(draftId);
    if (!draft) return false;

    draft.status = status;
    if (failReason !== undefined) {
      draft.failReason = failReason;
    }
    draft.updatedAt = Date.now();

    this.drafts.set(draftId, draft);
    this.saveDrafts();
    this.eventBus.emit('draftSave', draft);

    return true;
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
