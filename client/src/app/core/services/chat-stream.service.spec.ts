import { TestBed } from '@angular/core/testing';
import { ChatStreamService } from './chat-stream.service';

describe('ChatStreamService', () => {
  let service: ChatStreamService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ChatStreamService]
    });
    service = TestBed.inject(ChatStreamService);
  });

  afterEach(() => {
    // Clean up any open connections
    service.disconnect();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('State initialization', () => {
    it('should initialize with default values', () => {
      expect(service.isStreaming()).toBe(false);
      expect(service.streamingContent()).toBe('');
      expect(service.error()).toBeNull();
      expect(service.currentMessageId()).toBeNull();
      expect(service.isResearchActive()).toBe(false);
      expect(service.researchLogId()).toBeNull();
      expect(service.tokenUsage()).toBeNull();
    });
  });

  describe('startStream', () => {
    it('should reset state when starting a new stream', () => {
      // Set some initial state
      service.streamingContent.set('old content');
      service.error.set('old error');
      service.isResearchActive.set(true);

      // Start new stream
      service.startStream('test-message-id');

      // Verify state was reset
      expect(service.streamingContent()).toBe('');
      expect(service.error()).toBeNull();
      expect(service.isStreaming()).toBe(true);
      expect(service.currentMessageId()).toBe('test-message-id');
      expect(service.isResearchActive()).toBe(false);
    });
  });

  describe('clearStream', () => {
    it('should clear all state', () => {
      // Set some state
      service.isStreaming.set(true);
      service.streamingContent.set('test content');
      service.error.set('test error');
      service.currentMessageId.set('test-id');
      service.isResearchActive.set(true);
      service.researchLogId.set('test-log-id');
      service.tokenUsage.set({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      });

      // Clear stream
      service.clearStream();

      // Verify all state was cleared
      expect(service.isStreaming()).toBe(false);
      expect(service.streamingContent()).toBe('');
      expect(service.error()).toBeNull();
      expect(service.currentMessageId()).toBeNull();
      expect(service.isResearchActive()).toBe(false);
      expect(service.researchLogId()).toBeNull();
      expect(service.tokenUsage()).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should disconnect from SSE stream', () => {
      // This test would require mocking EventSource
      // For now, just verify the method exists and can be called
      expect(() => service.disconnect()).not.toThrow();
    });
  });

  // Note: Full SSE event handling tests would require mocking EventSource
  // which is complex in unit tests. Consider adding E2E tests for full SSE flow.
});
