import { Comment, ReportData, UserInfo } from '../types';
import EventBus from '../core/EventBus';
import { generateId } from '../utils';

class CommentManager {
  private eventBus: EventBus;
  private comments: Map<string, Comment[]> = new Map();
  private pageSize: number = 20;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async getComments(
    videoId: string,
    options: {
      page?: number;
      pageSize?: number;
      sortBy?: 'time' | 'likes';
    } = {}
  ): Promise<{ list: Comment[]; total: number; hasMore: boolean }> {
    const page = options.page || 1;
    const size = options.pageSize || this.pageSize;

    let comments = this.comments.get(videoId) || [];

    if (options.sortBy === 'likes') {
      comments = [...comments].sort((a, b) => b.likes - a.likes);
    } else {
      comments = [...comments].sort((a, b) => b.createdAt - a.createdAt);
    }

    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    const list = comments.slice(startIndex, endIndex);

    return {
      list,
      total: comments.length,
      hasMore: endIndex < comments.length
    };
  }

  async addComment(
    videoId: string,
    content: string,
    user: UserInfo,
    options: {
      replyToCommentId?: string;
    } = {}
  ): Promise<Comment> {
    if (!content.trim()) {
      throw new Error('Comment content cannot be empty');
    }

    const comment: Comment = {
      commentId: generateId('comment'),
      videoId,
      user: { ...user },
      content: content.trim(),
      createdAt: Date.now(),
      likes: 0,
      isLiked: false,
      replies: []
    };

    if (options.replyToCommentId) {
      const rootComment = this.findComment(videoId, options.replyToCommentId);
      if (rootComment) {
        if (!rootComment.replies) {
          rootComment.replies = [];
        }
        comment.replyTo = rootComment;
        rootComment.replies.push(comment);
      }
    } else {
      if (!this.comments.has(videoId)) {
        this.comments.set(videoId, []);
      }
      this.comments.get(videoId)!.unshift(comment);
    }

    this.eventBus.emit('commentAdd', comment);

    return comment;
  }

  async deleteComment(videoId: string, commentId: string): Promise<boolean> {
    const videoComments = this.comments.get(videoId);
    if (!videoComments) return false;

    const index = videoComments.findIndex(c => c.commentId === commentId);
    if (index !== -1) {
      videoComments.splice(index, 1);
      this.eventBus.emit('commentDelete', { commentId, videoId });
      return true;
    }

    for (const comment of videoComments) {
      if (comment.replies) {
        const replyIndex = comment.replies.findIndex(r => r.commentId === commentId);
        if (replyIndex !== -1) {
          comment.replies.splice(replyIndex, 1);
          this.eventBus.emit('commentDelete', { commentId, videoId });
          return true;
        }
      }
    }

    return false;
  }

  async likeComment(videoId: string, commentId: string): Promise<boolean> {
    const comment = this.findComment(videoId, commentId);
    if (!comment) return false;

    if (!comment.isLiked) {
      comment.isLiked = true;
      comment.likes += 1;
    }

    return true;
  }

  async unlikeComment(videoId: string, commentId: string): Promise<boolean> {
    const comment = this.findComment(videoId, commentId);
    if (!comment) return false;

    if (comment.isLiked) {
      comment.isLiked = false;
      comment.likes = Math.max(0, comment.likes - 1);
    }

    return true;
  }

  toggleCommentLike(videoId: string, commentId: string): boolean {
    const comment = this.findComment(videoId, commentId);
    if (!comment) return false;

    if (comment.isLiked) {
      this.unlikeComment(videoId, commentId);
      return false;
    } else {
      this.likeComment(videoId, commentId);
      return true;
    }
  }

  async reportComment(reportData: ReportData): Promise<boolean> {
    if (!reportData.targetId || !reportData.reason) {
      throw new Error('targetId and reason are required');
    }

    this.eventBus.emit('reportSubmit', reportData);

    return true;
  }

  async reportVideo(videoId: string, reason: string, description?: string): Promise<boolean> {
    const reportData: ReportData = {
      targetType: 'video',
      targetId: videoId,
      reason,
      description
    };

    return this.reportComment(reportData);
  }

  private findComment(videoId: string, commentId: string): Comment | null {
    const videoComments = this.comments.get(videoId);
    if (!videoComments) return null;

    for (const comment of videoComments) {
      if (comment.commentId === commentId) {
        return comment;
      }

      if (comment.replies) {
        for (const reply of comment.replies) {
          if (reply.commentId === commentId) {
            return reply;
          }
        }
      }
    }

    return null;
  }

  getCommentCount(videoId: string): number {
    const videoComments = this.comments.get(videoId);
    if (!videoComments) return 0;

    let count = videoComments.length;

    for (const comment of videoComments) {
      if (comment.replies) {
        count += comment.replies.length;
      }
    }

    return count;
  }

  setMockComments(videoId: string, comments: Comment[]): void {
    this.comments.set(videoId, [...comments]);
  }

  clearComments(videoId: string): void {
    this.comments.delete(videoId);
  }

  clearAll(): void {
    this.comments.clear();
  }

  destroy(): void {
    this.comments.clear();
  }
}

export default CommentManager;
