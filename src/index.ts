import EduShortVideoSDK from './sdk';

export { default as EduShortVideoSDK } from './sdk';
export { default } from './sdk';

export * from './types';
export { default as EventBus } from './core/EventBus';
export { default as ThemeManager } from './core/ThemeManager';

export { default as AccountManager } from './modules/AccountManager';
export { default as VideoPicker } from './modules/VideoPicker';
export { default as VideoRecorder } from './modules/VideoRecorder';
export { default as VideoEditor } from './modules/VideoEditor';
export { default as UploadManager } from './modules/UploadManager';
export { default as VideoProcessor } from './modules/VideoProcessor';
export { default as VideoPlayer } from './modules/VideoPlayer';
export { default as CommentManager } from './modules/CommentManager';
export { default as DataCallbackManager } from './modules/DataCallbackManager';

export * from './utils';

export function createEduShortVideoSDK(config: ConstructorParameters<typeof EduShortVideoSDK>[0]): EduShortVideoSDK {
  const sdk = new EduShortVideoSDK(config);
  sdk.init();
  return sdk;
}

declare global {
  interface Window {
    EduShortVideo: typeof EduShortVideoSDK;
    createEduShortVideoSDK: typeof createEduShortVideoSDK;
  }
}

if (typeof window !== 'undefined') {
  window.EduShortVideo = EduShortVideoSDK;
  window.createEduShortVideoSDK = createEduShortVideoSDK;
}
