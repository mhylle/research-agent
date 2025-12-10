import { TestBed } from '@angular/core/testing';
import { ResearchPanelService } from './research-panel.service';
import { Citation } from '../../models/conversation.model';

describe('ResearchPanelService', () => {
  let service: ResearchPanelService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ResearchPanelService);
  });

  afterEach(() => {
    // Clean up any open EventSource connections
    service.disconnectResearch();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Panel State', () => {
    it('should start with panel closed', () => {
      expect(service.isOpen()).toBe(false);
      expect(service.citations()).toEqual([]);
      expect(service.highlightedCitationIndex()).toBeNull();
    });

    it('should open panel with citations', () => {
      const citations: Citation[] = [
        { index: 1, url: 'https://example.com', title: 'Test', snippet: 'Test snippet' }
      ];

      service.openWithCitations(citations);

      expect(service.isOpen()).toBe(true);
      expect(service.citations()).toEqual(citations);
      expect(service.highlightedCitationIndex()).toBeNull();
    });

    it('should open panel with citations and highlight index', () => {
      const citations: Citation[] = [
        { index: 1, url: 'https://example.com', title: 'Test', snippet: 'Test snippet' }
      ];

      service.openWithCitations(citations, 0);

      expect(service.isOpen()).toBe(true);
      expect(service.citations()).toEqual(citations);
      expect(service.highlightedCitationIndex()).toBe(0);
    });

    it('should highlight citation and open panel if closed', () => {
      service.isOpen.set(false);

      service.highlightCitation(2);

      expect(service.isOpen()).toBe(true);
      expect(service.highlightedCitationIndex()).toBe(2);
    });

    it('should close panel and clear highlight', () => {
      service.isOpen.set(true);
      service.highlightedCitationIndex.set(1);

      service.close();

      expect(service.isOpen()).toBe(false);
      expect(service.highlightedCitationIndex()).toBeNull();
    });

    it('should toggle panel state', () => {
      expect(service.isOpen()).toBe(false);

      service.toggle();
      expect(service.isOpen()).toBe(true);

      service.toggle();
      expect(service.isOpen()).toBe(false);
    });
  });

  describe('Research Progress State', () => {
    it('should start with no active research', () => {
      expect(service.activeResearchLogId()).toBeNull();
      expect(service.isResearching()).toBe(false);
      expect(service.researchStage()).toBeNull();
      expect(service.researchProgress()).toBe(0);
    });

    it('should initialize research tracking state', () => {
      const logId = 'test-log-123';

      service.startResearchTracking(logId);

      expect(service.activeResearchLogId()).toBe(logId);
      expect(service.isResearching()).toBe(true);
      expect(service.researchProgress()).toBe(0);
      expect(service.researchStage()).toBe('Initializing...');

      // Clean up
      service.disconnectResearch();
    });

    it('should disconnect previous research when starting new tracking', () => {
      service.startResearchTracking('log-1');
      const firstEventSource = (service as any).eventSource;

      service.startResearchTracking('log-2');
      const secondEventSource = (service as any).eventSource;

      expect(firstEventSource).not.toBe(secondEventSource);
      expect(service.activeResearchLogId()).toBe('log-2');

      // Clean up
      service.disconnectResearch();
    });

    it('should disconnect research properly', () => {
      service.startResearchTracking('test-log');

      service.disconnectResearch();

      expect((service as any).eventSource).toBeNull();
    });
  });

  describe('State Management', () => {
    it('should clear all state', () => {
      const citations: Citation[] = [
        { index: 1, url: 'https://example.com', title: 'Test', snippet: 'Test snippet' }
      ];

      service.openWithCitations(citations, 0);
      service.startResearchTracking('test-log');

      service.clearState();

      expect(service.isOpen()).toBe(false);
      expect(service.citations()).toEqual([]);
      expect(service.highlightedCitationIndex()).toBeNull();
      expect(service.activeResearchLogId()).toBeNull();
      expect(service.isResearching()).toBe(false);
      expect(service.researchStage()).toBeNull();
      expect(service.researchProgress()).toBe(0);
      expect((service as any).eventSource).toBeNull();
    });
  });
});
