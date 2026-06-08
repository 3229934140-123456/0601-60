export interface UserInfo {
  userId: string;
  nickname?: string;
  avatar?: string;
  token: string;
  [key: string]: any;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  description?: string;
  coverUrl: string;
  videoUrl: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  author?: UserInfo;
  category?: string;
  columnId?: string;
  likes: number;
  favorites: number;
  comments: number;
  views: number;
  isLiked?: boolean;
  isFavorited?: boolean;
  createdAt: number;
  [key: string]: any;
}

export interface VideoQuality {
  quality: 'auto' | '360p' | '480p' | '720p' | '1080p';
  label: string;
  url: string;
  width?: number;
  height?: number;
}

export interface TextWatermarkConfig {
  text: string;
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';
  opacity?: number;
  fontSize?: number;
  color?: string;
  margin?: number;
}

export interface ImageWatermarkConfig {
  imageUrl: string;
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';
  opacity?: number;
  width?: number;
  height?: number;
  margin?: number;
}

export interface WatermarkConfig {
  text?: string;
  imageUrl?: string;
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';
  opacity?: number;
  fontSize?: number;
  color?: string;
  margin?: number;
}

export interface CombinedWatermarkConfig {
  textWatermark?: TextWatermarkConfig;
  imageWatermark?: ImageWatermarkConfig;
}

export interface RecordingConfig {
  maxDuration: number;
  minDuration?: number;
  cameraFacing: 'front' | 'back';
  quality: 'low' | 'medium' | 'high' | '4k';
  enableBeauty?: boolean;
  enableFilter?: boolean;
  flashMode: 'off' | 'on' | 'auto';
}

export interface UploadConfig {
  uploadUrl: string;
  chunkSize?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speed: number;
  videoId?: string;
}

export type UploadTaskType = 'upload' | 'publish' | 'draftPublish';

export interface UploadTaskInfo {
  videoId: string;
  fileName: string;
  fileSize: number;
  type: UploadTaskType;
  progress: UploadProgress;
  columnId?: string;
  draftId?: string;
  title?: string;
}

export type DraftStatus = 'pending' | 'processed' | 'publishFailed';

export interface Draft {
  draftId: string;
  title: string;
  description?: string;
  videoFile: File | null;
  videoPath?: string;
  originalVideoUrl?: string;
  coverImage?: string;
  duration?: number;
  width?: number;
  height?: number;
  size?: number;
  trimStartTime?: number;
  trimEndTime?: number;
  watermarkConfig?: WatermarkConfig;
  textWatermark?: TextWatermarkConfig;
  imageWatermark?: ImageWatermarkConfig;
  columnId?: string;
  processedVideoFile?: File | null;
  processedCoverImage?: string;
  processedDuration?: number;
  processedWidth?: number;
  processedHeight?: number;
  processedSize?: number;
  isProcessed?: boolean;
  status?: DraftStatus;
  failReason?: string;
  coverTime?: number;
  customCoverImage?: string;
  createdAt: number;
  updatedAt: number;
  [key: string]: any;
}

export interface DraftDetail extends Draft {
  videoAvailable: boolean;
  processedVideoAvailable: boolean;
  canPublish: boolean;
}

export interface Comment {
  commentId: string;
  videoId: string;
  user: UserInfo;
  content: string;
  createdAt: number;
  likes: number;
  isLiked?: boolean;
  replyTo?: Comment;
  replies?: Comment[];
  [key: string]: any;
}

export interface ReportData {
  targetType: 'video' | 'comment';
  targetId: string;
  reason: string;
  description?: string;
}

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  buttonTextColor?: string;
  borderRadius?: number;
  fontFamily?: string;
}

export interface SDKConfig {
  appId: string;
  theme?: Partial<ThemeConfig>;
  uploadConfig?: UploadConfig;
  apiBaseUrl?: string;
  entryTexts?: {
    recorder?: string;
    uploader?: string;
    player?: string;
    comments?: string;
  };
  [key: string]: any;
}

export interface RecordingResult {
  videoFile: File;
  coverImage: string;
  duration: number;
  width: number;
  height: number;
  size: number;
}

export interface EditResult {
  videoFile: File;
  coverImage: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  watermarkApplied: boolean;
}

export interface ProcessResult {
  videoFile: File;
  coverImage: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  hasTrim: boolean;
  hasTextWatermark: boolean;
  hasImageWatermark: boolean;
}

export interface PublishWorkflowOptions {
  videoFile?: File;
  title?: string;
  description?: string;
  columnId?: string;
  trimStartTime?: number;
  trimEndTime?: number;
  textWatermark?: TextWatermarkConfig;
  imageWatermark?: ImageWatermarkConfig;
  coverImage?: string;
  draftId?: string;
  onProgress?: (progress: UploadProgress) => void;
  onProcessProgress?: (step: number, total: number, stepName: string) => void;
}

export interface PublishResult {
  success: boolean;
  videoId?: string;
  videoInfo?: VideoInfo;
  error?: string;
}

export type SDKEventType =
  | 'ready'
  | 'recordingStart'
  | 'recordingStop'
  | 'recordingComplete'
  | 'uploadStart'
  | 'uploadProgress'
  | 'uploadComplete'
  | 'uploadError'
  | 'publishSuccess'
  | 'publishError'
  | 'playStart'
  | 'playPause'
  | 'playEnd'
  | 'playError'
  | 'playProgress'
  | 'like'
  | 'unlike'
  | 'favorite'
  | 'unfavorite'
  | 'commentAdd'
  | 'commentDelete'
  | 'reportSubmit'
  | 'draftSave'
  | 'draftDelete'
  | 'error';

export interface SDKEventDataMap {
  ready: { timestamp: number };
  recordingStart: { timestamp: number };
  recordingStop: { timestamp: number; duration: number };
  recordingComplete: RecordingResult;
  uploadStart: { videoId: string; fileName: string };
  uploadProgress: UploadProgress;
  uploadComplete: { videoId: string; videoUrl: string };
  uploadError: { videoId: string; error: string };
  publishSuccess: { videoId: string; videoInfo: VideoInfo };
  publishError: { videoId?: string; error: string };
  playStart: { videoId: string; currentTime: number };
  playPause: { videoId: string; currentTime: number };
  playEnd: { videoId: string; duration: number };
  playError: { videoId: string; error: string };
  playProgress: { videoId: string; currentTime: number; duration: number; percent: number };
  like: { videoId: string; count: number };
  unlike: { videoId: string; count: number };
  favorite: { videoId: string; count: number };
  unfavorite: { videoId: string; count: number };
  commentAdd: Comment;
  commentDelete: { commentId: string; videoId: string };
  reportSubmit: ReportData;
  draftSave: Draft;
  draftDelete: { draftId: string };
  error: { code: string; message: string; details?: any };
}

export type EventCallback<T extends SDKEventType = SDKEventType> = (
  data: T extends keyof SDKEventDataMap ? SDKEventDataMap[T] : any
) => void;
