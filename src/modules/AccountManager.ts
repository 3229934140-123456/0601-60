import { UserInfo, SDKConfig } from '../types';
import EventBus from '../core/EventBus';

class AccountManager {
  private userInfo: UserInfo | null = null;
  private config: SDKConfig;
  private eventBus: EventBus;
  private storageKey: string = 'edu_shortvideo_user';

  constructor(config: SDKConfig, eventBus: EventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.loadFromStorage();
  }

  async bindAccount(userInfo: UserInfo): Promise<UserInfo> {
    if (!userInfo.userId || !userInfo.token) {
      throw new Error('userId and token are required for account binding');
    }

    this.userInfo = userInfo;
    this.saveToStorage();

    this.eventBus.emit('ready', { timestamp: Date.now() });

    return userInfo;
  }

  unbindAccount(): void {
    this.userInfo = null;
    this.removeFromStorage();
  }

  getUserInfo(): UserInfo | null {
    return this.userInfo ? { ...this.userInfo } : null;
  }

  isLoggedIn(): boolean {
    return this.userInfo !== null && !!this.userInfo.token;
  }

  getToken(): string | null {
    return this.userInfo?.token || null;
  }

  updateUserInfo(updates: Partial<UserInfo>): UserInfo | null {
    if (!this.userInfo) return null;
    this.userInfo = { ...this.userInfo, ...updates };
    this.saveToStorage();
    return { ...this.userInfo };
  }

  async refreshToken(): Promise<string | null> {
    return this.getToken();
  }

  private saveToStorage(): void {
    try {
      if (this.userInfo && typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.userInfo));
      }
    } catch (e) {
      console.warn('[EduShortVideo SDK] Failed to save user info to storage:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          this.userInfo = JSON.parse(stored);
        }
      }
    } catch (e) {
      console.warn('[EduShortVideo SDK] Failed to load user info from storage:', e);
    }
  }

  private removeFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.storageKey);
      }
    } catch (e) {
      console.warn('[EduShortVideo SDK] Failed to remove user info from storage:', e);
    }
  }
}

export default AccountManager;
