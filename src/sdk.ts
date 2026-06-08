import {
  SDKConfig,
  UserInfo,
  ThemeConfig,
  RecordingConfig,
  WatermarkConfig,
  TextWatermarkConfig,
  ImageWatermarkConfig,
  UploadProgress,
  Draft,
  VideoInfo,
  VideoQuality,
  Comment,
  ReportData,
  SDKEventType,
  EventCallback,
  SDKEventDataMap,
  RecordingResult,
  EditResult,
  PublishResult,
  ProcessResult
} from './types';

import EventBus from './core/EventBus';
import ThemeManager from './core/ThemeManager';

import AccountManager from './modules/AccountManager';
import VideoPicker from './modules/VideoPicker';
import VideoRecorder from './modules/VideoRecorder';
import VideoEditor from './modules/VideoEditor';
import UploadManager from './modules/UploadManager';
import VideoPlayer from './modules/VideoPlayer';
import CommentManager from './modules/CommentManager';
import DataCallbackManager from './modules/DataCallbackManager';
import VideoProcessor from './modules/VideoProcessor';

import { generateId, formatDuration, formatFileSize } from './utils';

class EduShortVideoSDK {
  private config: SDKConfig;
  private eventBus: EventBus;
  private themeManager: ThemeManager;

  private accountManager: AccountManager;
  private videoPicker: VideoPicker;
  private videoRecorder: VideoRecorder;
  private videoEditor: VideoEditor;
  private uploadManager: UploadManager;
  private videoPlayer: VideoPlayer;
  private commentManager: CommentManager;
  private dataCallbackManager: DataCallbackManager;
  private videoProcessor: VideoProcessor;

  private initialized: boolean = false;
  private version: string = '1.0.0';

  constructor(config: SDKConfig) {
    this.config = config;
    this.eventBus = new EventBus();
    this.themeManager = new ThemeManager();

    this.accountManager = new AccountManager(config, this.eventBus);
    this.videoPicker = new VideoPicker(this.eventBus);
    this.videoRecorder = new VideoRecorder(this.eventBus);
    this.videoEditor = new VideoEditor();
    this.uploadManager = new UploadManager(config.uploadConfig || { uploadUrl: '' }, this.eventBus);
    this.videoPlayer = new VideoPlayer(this.eventBus);
    this.commentManager = new CommentManager(this.eventBus);
    this.dataCallbackManager = new DataCallbackManager(this.eventBus);
    this.videoProcessor = new VideoProcessor(this.videoEditor, this.uploadManager, this.eventBus);

    if (config.theme) {
      this.themeManager.setTheme(config.theme);
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.eventBus.emit('ready', { timestamp: Date.now() });
  }

  getVersion(): string {
    return this.version;
  }

  setTheme(theme: Partial<ThemeConfig>): void {
    this.themeManager.setTheme(theme);
  }

  getTheme(): ThemeConfig {
    return this.themeManager.getTheme();
  }

  setEntryTexts(texts: Partial<NonNullable<SDKConfig['entryTexts']>>): void {
    if (!this.config.entryTexts) {
      this.config.entryTexts = {};
    }
    this.config.entryTexts = { ...this.config.entryTexts, ...texts };
  }

  getEntryTexts(): NonNullable<SDKConfig['entryTexts']> {
    return this.config.entryTexts || {};
  }

  // ===== 账号绑定模块 =====
  async bindAccount(userInfo: UserInfo): Promise<UserInfo> {
    return this.accountManager.bindAccount(userInfo);
  }

  unbindAccount(): void {
    this.accountManager.unbindAccount();
  }

  getUserInfo(): UserInfo | null {
    return this.accountManager.getUserInfo();
  }

  isLoggedIn(): boolean {
    return this.accountManager.isLoggedIn();
  }

  updateUserInfo(updates: Partial<UserInfo>): UserInfo | null {
    return this.accountManager.updateUserInfo(updates);
  }

  // ===== 视频选择模块 =====
  async selectVideo(options?: Parameters<typeof VideoPicker.prototype.selectVideo>[0]) {
    return this.videoPicker.selectVideo(options);
  }

  async generateThumbnail(videoUrl: string, time?: number): Promise<string> {
    return this.videoPicker.generateThumbnail(videoUrl, time);
  }

  getVideoInfo(file: File) {
    return this.videoPicker.getVideoInfo(file);
  }

  // ===== 拍摄录制模块 =====
  async initRecorder(container: HTMLElement, config?: Partial<RecordingConfig>): Promise<void> {
    return this.videoRecorder.init(container, config);
  }

  startRecording(): void {
    this.videoRecorder.startRecording();
  }

  pauseRecording(): void {
    this.videoRecorder.pauseRecording();
  }

  resumeRecording(): void {
    this.videoRecorder.resumeRecording();
  }

  stopRecording(): Promise<RecordingResult> {
    return this.videoRecorder.stopRecording();
  }

  setMaxRecordDuration(duration: number): void {
    this.videoRecorder.setMaxDuration(duration);
  }

  switchCamera(): Promise<void> {
    return this.videoRecorder.switchCamera();
  }

  toggleFlash(): boolean {
    return this.videoRecorder.toggleFlash();
  }

  getRecorderConfig(): RecordingConfig {
    return this.videoRecorder.getConfig();
  }

  setRecorderConfig(config: Partial<RecordingConfig>): void {
    this.videoRecorder.setConfig(config);
  }

  isRecording(): boolean {
    return this.videoRecorder.isRecordingActive();
  }

  isPaused(): boolean {
    return this.videoRecorder.isRecordingPaused();
  }

  getCurrentRecordDuration(): number {
    return this.videoRecorder.getCurrentDuration();
  }

  async takePhoto(): Promise<string> {
    return this.videoRecorder.takePhoto();
  }

  destroyRecorder(): void {
    this.videoRecorder.destroy();
  }

  // ===== 剪辑处理模块 =====
  async addWatermark(videoFile: File, watermarkConfig: WatermarkConfig): Promise<EditResult> {
    return this.videoEditor.addWatermark(videoFile, watermarkConfig);
  }

  async generateCover(videoFile: File, time?: number): Promise<string> {
    return this.videoEditor.generateCover(videoFile, time);
  }

  async generateMultipleCovers(videoFile: File, count?: number): Promise<string[]> {
    return this.videoEditor.generateMultipleCovers(videoFile, count);
  }

  async trimVideo(videoFile: File, startTime: number, endTime: number) {
    return this.videoEditor.trimVideo(videoFile, startTime, endTime);
  }

  async applyWatermarkToImage(imageSrc: string, config: WatermarkConfig): Promise<string> {
    return this.videoEditor.applyWatermarkToImage(imageSrc, config);
  }

  async addTextWatermark(videoFile: File, config: TextWatermarkConfig): Promise<EditResult> {
    return this.videoEditor.addTextWatermark(videoFile, config);
  }

  async addImageWatermark(videoFile: File, config: ImageWatermarkConfig): Promise<EditResult> {
    return this.videoEditor.addImageWatermark(videoFile, config);
  }

  async addCombinedWatermark(
    videoFile: File,
    config: { textWatermark?: TextWatermarkConfig; imageWatermark?: ImageWatermarkConfig }
  ): Promise<EditResult> {
    return this.videoEditor.addCombinedWatermark(videoFile, config);
  }

  async processVideo(
    videoFile: File,
    options: {
      trimStartTime?: number;
      trimEndTime?: number;
      textWatermark?: TextWatermarkConfig;
      imageWatermark?: ImageWatermarkConfig;
    }
  ): Promise<ProcessResult> {
    return this.videoEditor.processVideoFull(videoFile, options);
  }

  // ===== 成片处理工作流 =====
  createVideoProcessor(videoFile?: File): VideoProcessor {
    const processor = new VideoProcessor(this.videoEditor, this.uploadManager, this.eventBus);
    if (videoFile) {
      processor.setVideo(videoFile);
    }
    return processor;
  }

  async processAndPublish(
    videoFile: File,
    options: {
      columnId: string;
      title?: string;
      description?: string;
      trimStartTime?: number;
      trimEndTime?: number;
      textWatermark?: TextWatermarkConfig;
      imageWatermark?: ImageWatermarkConfig;
      onProcessStep?: (step: string, index: number, total: number) => void;
      onUploadProgress?: (progress: UploadProgress) => void;
      draftId?: string;
      deleteDraftOnSuccess?: boolean;
      coverImage?: string;
    }
  ): Promise<PublishResult> {
    const processor = this.createVideoProcessor(videoFile);

    if (options.title) processor.setTitle(options.title);
    if (options.description) processor.setDescription(options.description);
    if (options.columnId) processor.setColumnId(options.columnId);
    if (options.trimStartTime || options.trimEndTime) {
      processor.setTrim(options.trimStartTime || 0, options.trimEndTime || 0);
    }
    if (options.textWatermark) processor.setTextWatermark(options.textWatermark);
    if (options.imageWatermark) processor.setImageWatermark(options.imageWatermark);
    if (options.draftId) processor.setDraftId(options.draftId);

    await processor.process();

    return processor.publish({
      columnId: options.columnId,
      onProgress: options.onUploadProgress,
      deleteDraftOnSuccess: options.deleteDraftOnSuccess
    });
  }

  async publishDraft(
    draftId: string,
    options: {
      columnId?: string;
      videoFile?: File;
      onUploadProgress?: (progress: UploadProgress) => void;
      deleteDraftOnSuccess?: boolean;
    } = {}
  ): Promise<PublishResult> {
    const draft = this.uploadManager.getDraft(draftId);
    if (!draft) {
      throw new Error('Draft not found');
    }

    const videoFile = options.videoFile || draft.videoFile || undefined;
    if (!videoFile) {
      throw new Error('Video file not available, please provide videoFile option');
    }

    const processor = this.createVideoProcessor(videoFile);
    await processor.loadFromDraft(draft, videoFile);

    if (options.columnId) {
      processor.setColumnId(options.columnId);
    }

    return processor.publish({
      onProgress: options.onUploadProgress,
      deleteDraftOnSuccess: options.deleteDraftOnSuccess !== false
    });
  }

  // ===== 上传发布模块 =====
  async uploadVideo(videoFile: File, options?: Parameters<typeof UploadManager.prototype.uploadVideo>[1]) {
    return this.uploadManager.uploadVideo(videoFile, options);
  }

  async publishVideo(videoFile: File, options?: Parameters<typeof UploadManager.prototype.uploadWithProgress>[1]) {
    return this.uploadManager.uploadWithProgress(videoFile, options);
  }

  async publishToColumn(
    videoFile: File,
    columnId: string,
    options?: {
      title?: string;
      description?: string;
      coverImage?: string;
      onProgress?: (progress: UploadProgress) => void;
    }
  ): Promise<PublishResult> {
    return this.uploadManager.publishToColumn(videoFile, columnId, options);
  }

  cancelUpload(videoId: string): boolean {
    return this.uploadManager.cancelUpload(videoId);
  }

  cancelAllUploads(): void {
    this.uploadManager.cancelAllUploads();
  }

  getUploadProgress(videoId: string): UploadProgress | null {
    return this.uploadManager.getUploadProgress(videoId);
  }

  getUploadTasks(type?: Parameters<typeof UploadManager.prototype.getUploadTasks>[0]): ReturnType<typeof UploadManager.prototype.getUploadTasks> {
    return this.uploadManager.getUploadTasks(type);
  }

  getUploadTaskCount(): number {
    return this.uploadManager.getUploadTaskCount();
  }

  setUploadConfig(config: Parameters<typeof UploadManager.prototype.setConfig>[0]): void {
    this.uploadManager.setConfig(config);
  }

  // ===== 草稿管理 =====
  async saveDraft(draft: Omit<Draft, 'draftId' | 'createdAt' | 'updatedAt'>): Promise<Draft> {
    return this.uploadManager.saveDraft(draft);
  }

  async updateDraft(draftId: string, updates: Partial<Draft>): Promise<Draft | null> {
    return this.uploadManager.updateDraft(draftId, updates);
  }

  getDraft(draftId: string): Draft | null {
    return this.uploadManager.getDraft(draftId);
  }

  getDraftDetail(draftId: string): ReturnType<typeof UploadManager.prototype.getDraftDetail> {
    return this.uploadManager.getDraftDetail(draftId);
  }

  getDrafts(status?: Parameters<typeof UploadManager.prototype.getDrafts>[0]): ReturnType<typeof UploadManager.prototype.getDrafts> {
    return this.uploadManager.getDrafts(status);
  }

  getDraftCounts(): ReturnType<typeof UploadManager.prototype.getDraftCounts> {
    return this.uploadManager.getDraftCounts();
  }

  deleteDraft(draftId: string): boolean {
    return this.uploadManager.deleteDraft(draftId);
  }

  // ===== 播放互动模块 =====
  initPlayer(container: HTMLElement): void {
    this.videoPlayer.init(container);
  }

  async loadVideo(videoInfo: VideoInfo, qualities?: VideoQuality[]): Promise<void> {
    return this.videoPlayer.loadVideo(videoInfo, qualities);
  }

  async loadVideoStream(
    videoUrl: string,
    options?: {
      videoId?: string;
      qualities?: VideoQuality[];
      title?: string;
    }
  ): Promise<void> {
    return this.videoPlayer.loadVideoStream(videoUrl, options);
  }

  play(): Promise<void> {
    return this.videoPlayer.play();
  }

  pause(): void {
    this.videoPlayer.pause();
  }

  togglePlay(): boolean {
    return this.videoPlayer.togglePlay();
  }

  seek(time: number): void {
    this.videoPlayer.seek(time);
  }

  seekToPercent(percent: number): void {
    this.videoPlayer.seekToPercent(percent);
  }

  setVolume(volume: number): void {
    this.videoPlayer.setVolume(volume);
  }

  getVolume(): number {
    return this.videoPlayer.getVolume();
  }

  mute(): void {
    this.videoPlayer.mute();
  }

  unmute(): void {
    this.videoPlayer.unmute();
  }

  toggleMute(): boolean {
    return this.videoPlayer.toggleMute();
  }

  setPlaybackRate(rate: number): void {
    this.videoPlayer.setPlaybackRate(rate);
  }

  getPlaybackRate(): number {
    return this.videoPlayer.getPlaybackRate();
  }

  getCurrentTime(): number {
    return this.videoPlayer.getCurrentTime();
  }

  getDuration(): number {
    return this.videoPlayer.getDuration();
  }

  getQualities(): VideoQuality[] {
    return this.videoPlayer.getQualities();
  }

  getCurrentQuality(): VideoQuality | null {
    return this.videoPlayer.getCurrentQuality();
  }

  setQuality(quality: VideoQuality['quality'] | string): boolean {
    return this.videoPlayer.setQuality(quality);
  }

  toggleFullscreen(): boolean {
    return this.videoPlayer.toggleFullscreen();
  }

  isPlaying(): boolean {
    return this.videoPlayer.isVideoPlaying();
  }

  isMuted(): boolean {
    return this.videoPlayer.isVideoMuted();
  }

  isFullscreen(): boolean {
    return this.videoPlayer.isVideoFullscreen();
  }

  getCurrentVideo(): VideoInfo | null {
    return this.videoPlayer.getCurrentVideo();
  }

  destroyPlayer(): void {
    this.videoPlayer.destroy();
  }

  // ===== 点赞收藏 =====
  async like(videoId?: string): Promise<boolean> {
    return this.videoPlayer.like(videoId);
  }

  async unlike(videoId?: string): Promise<boolean> {
    return this.videoPlayer.unlike(videoId);
  }

  toggleLike(videoId?: string): boolean {
    return this.videoPlayer.toggleLike(videoId);
  }

  async favorite(videoId?: string): Promise<boolean> {
    return this.videoPlayer.favorite(videoId);
  }

  async unfavorite(videoId?: string): Promise<boolean> {
    return this.videoPlayer.unfavorite(videoId);
  }

  toggleFavorite(videoId?: string): boolean {
    return this.videoPlayer.toggleFavorite(videoId);
  }

  // ===== 评论管理模块 =====
  async getComments(
    videoId: string,
    options?: Parameters<typeof CommentManager.prototype.getComments>[1]
  ) {
    return this.commentManager.getComments(videoId, options);
  }

  async addComment(
    videoId: string,
    content: string,
    user: UserInfo,
    options?: {
      replyToCommentId?: string;
    }
  ): Promise<Comment> {
    return this.commentManager.addComment(videoId, content, user, options);
  }

  async deleteComment(videoId: string, commentId: string): Promise<boolean> {
    return this.commentManager.deleteComment(videoId, commentId);
  }

  async likeComment(videoId: string, commentId: string): Promise<boolean> {
    return this.commentManager.likeComment(videoId, commentId);
  }

  async unlikeComment(videoId: string, commentId: string): Promise<boolean> {
    return this.commentManager.unlikeComment(videoId, commentId);
  }

  toggleCommentLike(videoId: string, commentId: string): boolean {
    return this.commentManager.toggleCommentLike(videoId, commentId);
  }

  async report(reportData: ReportData): Promise<boolean> {
    return this.commentManager.reportComment(reportData);
  }

  async reportVideo(videoId: string, reason: string, description?: string): Promise<boolean> {
    return this.commentManager.reportVideo(videoId, reason, description);
  }

  async reportComment(commentId: string, videoId: string, reason: string, description?: string): Promise<boolean> {
    return this.commentManager.reportComment({
      targetType: 'comment',
      targetId: commentId,
      reason,
      description
    });
  }

  getCommentCount(videoId: string): number {
    return this.commentManager.getCommentCount(videoId);
  }

  // ===== 数据回调模块 =====
  on<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    this.dataCallbackManager.on(event, callback);
  }

  once<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    this.dataCallbackManager.once(event, callback);
  }

  off<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    this.dataCallbackManager.off(event, callback);
  }

  onPlayComplete(callback: (data: SDKEventDataMap['playEnd']) => void): void {
    this.dataCallbackManager.onPlayComplete(callback);
  }

  offPlayComplete(callback: (data: SDKEventDataMap['playEnd']) => void): void {
    this.dataCallbackManager.offPlayComplete(callback);
  }

  onUploadProgress(callback: (data: SDKEventDataMap['uploadProgress']) => void): void {
    this.dataCallbackManager.onUploadProgress(callback);
  }

  offUploadProgress(callback: (data: SDKEventDataMap['uploadProgress']) => void): void {
    this.dataCallbackManager.offUploadProgress(callback);
  }

  onUploadComplete(callback: (data: SDKEventDataMap['uploadComplete']) => void): void {
    this.dataCallbackManager.onUploadComplete(callback);
  }

  offUploadComplete(callback: (data: SDKEventDataMap['uploadComplete']) => void): void {
    this.dataCallbackManager.offUploadComplete(callback);
  }

  onPublishSuccess(callback: (data: SDKEventDataMap['publishSuccess']) => void): void {
    this.dataCallbackManager.onPublishSuccess(callback);
  }

  offPublishSuccess(callback: (data: SDKEventDataMap['publishSuccess']) => void): void {
    this.dataCallbackManager.offPublishSuccess(callback);
  }

  removeAllEventListeners(event?: SDKEventType): void {
    this.dataCallbackManager.removeAllListeners(event);
  }

  // ===== 工具方法 =====
  utils = {
    generateId,
    formatDuration,
    formatFileSize
  };

  destroy(): void {
    this.videoRecorder.destroy();
    this.videoEditor.destroy();
    this.videoPicker.destroy();
    this.videoPlayer.destroy();
    this.uploadManager.destroy();
    this.commentManager.destroy();
    this.dataCallbackManager.destroy();
    this.initialized = false;
  }
}

export default EduShortVideoSDK;
