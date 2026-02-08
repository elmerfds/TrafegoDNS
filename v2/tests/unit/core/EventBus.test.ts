/**
 * EventBus unit tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, EventTypes } from '../../../src/core/EventBus.js';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('subscribe', () => {
    it('should subscribe to an event', () => {
      const handler = vi.fn();
      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler);

      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_STARTED)).toBe(1);
    });

    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler);

      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_STARTED)).toBe(1);

      unsubscribe();

      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_STARTED)).toBe(0);
    });

    it('should allow multiple subscribers to the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler1);
      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler2);

      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_STARTED)).toBe(2);
    });
  });

  describe('publish', () => {
    it('should call handler with event data', () => {
      const handler = vi.fn();
      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler);

      const payload = { version: '2.0.0', mode: 'traefik' };
      eventBus.publish(EventTypes.SYSTEM_STARTED, payload);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should call all subscribers for an event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler1);
      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler2);

      const payload = { version: '2.0.0', mode: 'direct' };
      eventBus.publish(EventTypes.SYSTEM_STARTED, payload);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for different events', () => {
      const handler = vi.fn();
      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler);

      eventBus.publish(EventTypes.SYSTEM_SHUTDOWN, { reason: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should only call handler once', () => {
      const handler = vi.fn();
      eventBus.once(EventTypes.SYSTEM_STARTED, handler);

      const payload = { version: '2.0.0', mode: 'traefik' };
      eventBus.publish(EventTypes.SYSTEM_STARTED, payload);
      eventBus.publish(EventTypes.SYSTEM_STARTED, payload);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishAsync', () => {
    it('should wait for async handlers to complete', async () => {
      const results: number[] = [];

      eventBus.subscribe(EventTypes.SYSTEM_STARTED, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(1);
      });

      eventBus.subscribe(EventTypes.SYSTEM_STARTED, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        results.push(2);
      });

      await eventBus.publishAsync(EventTypes.SYSTEM_STARTED, { version: '2.0.0', mode: 'traefik' });

      expect(results).toHaveLength(2);
      expect(results).toContain(1);
      expect(results).toContain(2);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for a specific event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler1);
      eventBus.subscribe(EventTypes.SYSTEM_SHUTDOWN, handler2);

      eventBus.removeAllListeners(EventTypes.SYSTEM_STARTED);

      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_STARTED)).toBe(0);
      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_SHUTDOWN)).toBe(1);
    });

    it('should remove all listeners when no event specified', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe(EventTypes.SYSTEM_STARTED, handler1);
      eventBus.subscribe(EventTypes.SYSTEM_SHUTDOWN, handler2);

      eventBus.removeAllListeners();

      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_STARTED)).toBe(0);
      expect(eventBus.getSubscriberCount(EventTypes.SYSTEM_SHUTDOWN)).toBe(0);
    });
  });
});
