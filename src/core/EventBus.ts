import { SDKEventType, SDKEventDataMap, EventCallback } from '../types';

type EventHandlerMap = {
  [K in SDKEventType]?: Set<EventCallback<K>>;
};

class EventBus {
  private handlers: EventHandlerMap = {};
  private onceHandlers: EventHandlerMap = {};

  on<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    if (!this.handlers[event]) {
      (this.handlers as Record<string, Set<EventCallback<T>>>)[event] = new Set();
    }
    ((this.handlers as Record<string, Set<EventCallback<T>>>)[event] as Set<EventCallback<T>>).add(callback);
  }

  once<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    if (!this.onceHandlers[event]) {
      (this.onceHandlers as Record<string, Set<EventCallback<T>>>)[event] = new Set();
    }
    ((this.onceHandlers as Record<string, Set<EventCallback<T>>>)[event] as Set<EventCallback<T>>).add(callback);
  }

  off<T extends SDKEventType>(event: T, callback: EventCallback<T>): void {
    if (this.handlers[event]) {
      (this.handlers[event] as Set<EventCallback<T>>).delete(callback);
    }
    if (this.onceHandlers[event]) {
      (this.onceHandlers[event] as Set<EventCallback<T>>).delete(callback);
    }
  }

  emit<T extends SDKEventType>(event: T, data: T extends keyof SDKEventDataMap ? SDKEventDataMap[T] : any): void {
    const handlers = this.handlers[event];
    const onceHandlers = this.onceHandlers[event];

    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (e) {
          console.error(`[EduShortVideo SDK] Event handler error for '${event}':`, e);
        }
      });
    }

    if (onceHandlers) {
      onceHandlers.forEach((handler) => {
        try {
          handler(data);
        } catch (e) {
          console.error(`[EduShortVideo SDK] Once event handler error for '${event}':`, e);
        }
      });
      this.onceHandlers[event] = undefined;
    }
  }

  removeAllListeners(event?: SDKEventType): void {
    if (event) {
      this.handlers[event] = undefined;
      this.onceHandlers[event] = undefined;
    } else {
      this.handlers = {};
      this.onceHandlers = {};
    }
  }

  listenerCount(event: SDKEventType): number {
    let count = 0;
    if (this.handlers[event]) {
      count += this.handlers[event]!.size;
    }
    if (this.onceHandlers[event]) {
      count += this.onceHandlers[event]!.size;
    }
    return count;
  }
}

export default EventBus;
