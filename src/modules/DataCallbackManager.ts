import { SDKEventType, SDKEventDataMap, EventCallback } from '../types';
import EventBus from '../core/EventBus';

class DataCallbackManager {
  private eventBus: EventBus;
  private globalCallbacks: Map<SDKEventType, EventCallback[]> = new Map();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  on<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    this.eventBus.on(event, callback);
  }

  once<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    this.eventBus.once(event, callback);
  }

  off<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    this.eventBus.off(event, callback);
  }

  onPlayComplete(callback: (data: SDKEventDataMap['playEnd']) => void): void {
    this.on('playEnd', callback);
  }

  offPlayComplete(callback: (data: SDKEventDataMap['playEnd']) => void): void {
    this.off('playEnd', callback);
  }

  onUploadProgress(callback: (data: SDKEventDataMap['uploadProgress']) => void): void {
    this.on('uploadProgress', callback);
  }

  offUploadProgress(callback: (data: SDKEventDataMap['uploadProgress']) => void): void {
    this.off('uploadProgress', callback);
  }

  onUploadComplete(callback: (data: SDKEventDataMap['uploadComplete']) => void): void {
    this.on('uploadComplete', callback);
  }

  offUploadComplete(callback: (data: SDKEventDataMap['uploadComplete']) => void): void {
    this.off('uploadComplete', callback);
  }

  onPublishSuccess(callback: (data: SDKEventDataMap['publishSuccess']) => void): void {
    this.on('publishSuccess', callback);
  }

  offPublishSuccess(callback: (data: SDKEventDataMap['publishSuccess']) => void): void {
    this.off('publishSuccess', callback);
  }

  onPublishError(callback: (data: SDKEventDataMap['publishError']) => void): void {
    this.on('publishError', callback);
  }

  offPublishError(callback: (data: SDKEventDataMap['publishError']) => void): void {
    this.off('publishError', callback);
  }

  onLike(callback: (data: SDKEventDataMap['like']) => void): void {
    this.on('like', callback);
  }

  offLike(callback: (data: SDKEventDataMap['like']) => void): void {
    this.off('like', callback);
  }

  onFavorite(callback: (data: SDKEventDataMap['favorite']) => void): void {
    this.on('favorite', callback);
  }

  offFavorite(callback: (data: SDKEventDataMap['favorite']) => void): void {
    this.off('favorite', callback);
  }

  onCommentAdd(callback: (data: SDKEventDataMap['commentAdd']) => void): void {
    this.on('commentAdd', callback);
  }

  offCommentAdd(callback: (data: SDKEventDataMap['commentAdd']) => void): void {
    this.off('commentAdd', callback);
  }

  onRecordingComplete(callback: (data: SDKEventDataMap['recordingComplete']) => void): void {
    this.on('recordingComplete', callback);
  }

  offRecordingComplete(callback: (data: SDKEventDataMap['recordingComplete']) => void): void {
    this.off('recordingComplete', callback);
  }

  onError(callback: (data: SDKEventDataMap['error']) => void): void {
    this.on('error', callback);
  }

  offError(callback: (data: SDKEventDataMap['error']) => void): void {
    this.off('error', callback);
  }

  emit<T extends SDKEventType>(event: T, data: T extends keyof SDKEventDataMap ? SDKEventDataMap[T] : any): void {
    this.eventBus.emit(event, data);
  }

  removeAllListeners(event?: SDKEventType): void {
    this.eventBus.removeAllListeners(event);
  }

  destroy(): void {
    this.eventBus.removeAllListeners();
    this.globalCallbacks.clear();
  }
}

export default DataCallbackManager;
