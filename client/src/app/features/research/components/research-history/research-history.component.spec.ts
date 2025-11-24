import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { ResearchHistoryComponent } from './research-history.component';
import { LogsService } from '../../../../core/services/logs.service';
import { LogSession } from '../../../../models';

describe('ResearchHistoryComponent', () => {
  let component: ResearchHistoryComponent;
  let fixture: ComponentFixture<ResearchHistoryComponent>;
  let logsServiceMock: jasmine.SpyObj<LogsService>;
  let routerMock: jasmine.SpyObj<Router>;

  const mockSessions: LogSession[] = [
    {
      logId: 'log-1',
      query: 'What are black holes?',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      totalDuration: 5000,
      stageCount: 3,
      toolCallCount: 5,
      status: 'completed'
    },
    {
      logId: 'log-2',
      query: 'How does photosynthesis work?',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      totalDuration: 4500,
      stageCount: 3,
      toolCallCount: 4,
      status: 'completed'
    },
    {
      logId: 'log-3',
      query: 'Explain quantum computing',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      totalDuration: 6000,
      stageCount: 3,
      toolCallCount: 6,
      status: 'error'
    }
  ];

  beforeEach(async () => {
    // Create mock services
    logsServiceMock = jasmine.createSpyObj('LogsService', ['loadSessions'], {
      sessions: signal(mockSessions),
      isLoadingSessions: signal(false),
      error: signal(null)
    });

    routerMock = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ResearchHistoryComponent],
      providers: [
        { provide: LogsService, useValue: logsServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResearchHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should load sessions on init if not already loaded', () => {
      const emptyMock = jasmine.createSpyObj('LogsService', ['loadSessions'], {
        sessions: signal([]),
        isLoadingSessions: signal(false),
        error: signal(null)
      });
      TestBed.overrideProvider(LogsService, { useValue: emptyMock });
      const testFixture = TestBed.createComponent(ResearchHistoryComponent);
      const testComponent = testFixture.componentInstance;
      testComponent.ngOnInit();
      expect(emptyMock.loadSessions).toHaveBeenCalled();
    });

    it('should not load sessions if already loaded', () => {
      const loadedMock = jasmine.createSpyObj('LogsService', ['loadSessions'], {
        sessions: signal(mockSessions),
        isLoadingSessions: signal(false),
        error: signal(null)
      });
      TestBed.overrideProvider(LogsService, { useValue: loadedMock });
      const testFixture = TestBed.createComponent(ResearchHistoryComponent);
      const testComponent = testFixture.componentInstance;
      testComponent.ngOnInit();
      expect(loadedMock.loadSessions).not.toHaveBeenCalled();
    });

    it('should not load sessions if currently loading', () => {
      const loadingMock = jasmine.createSpyObj('LogsService', ['loadSessions'], {
        sessions: signal([]),
        isLoadingSessions: signal(true),
        error: signal(null)
      });
      TestBed.overrideProvider(LogsService, { useValue: loadingMock });
      const testFixture = TestBed.createComponent(ResearchHistoryComponent);
      const testComponent = testFixture.componentInstance;
      testComponent.ngOnInit();
      expect(loadingMock.loadSessions).not.toHaveBeenCalled();
    });
  });

  describe('History Items Display', () => {
    it('should display all history items', () => {
      const items = fixture.nativeElement.querySelectorAll('.history-item');
      expect(items.length).toBe(3);
    });

    it('should display query text for each item', () => {
      const queries = fixture.nativeElement.querySelectorAll('.history-item__query');
      expect(queries[0].textContent).toContain('What are black holes?');
      expect(queries[1].textContent).toContain('How does photosynthesis work?');
      expect(queries[2].textContent).toContain('Explain quantum computing');
    });

    it('should display relative timestamps correctly', () => {
      const timestamps = fixture.nativeElement.querySelectorAll('.meta-timestamp');
      expect(timestamps[0].textContent).toContain('hour');
      expect(timestamps[1].textContent).toContain('Yesterday');
      expect(timestamps[2].textContent).toContain('days ago');
    });

    it('should display error status for failed queries', () => {
      const errorStatus = fixture.nativeElement.querySelectorAll('.meta-status--error');
      expect(errorStatus.length).toBe(1);
      expect(errorStatus[0].textContent).toContain('Failed');
    });

    it('should respect maxItems input', () => {
      fixture.componentRef.setInput('maxItems', 2);
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll('.history-item');
      expect(items.length).toBe(2);
    });
  });

  describe('Empty State', () => {
    beforeEach(() => {
      // Re-create mock with empty sessions
      logsServiceMock = jasmine.createSpyObj('LogsService', ['loadSessions'], {
        sessions: signal([]),
        isLoadingSessions: signal(false),
        error: signal(null)
      });
      TestBed.overrideProvider(LogsService, { useValue: logsServiceMock });
      fixture = TestBed.createComponent(ResearchHistoryComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should display empty state when no sessions', () => {
      const emptyState = fixture.nativeElement.querySelector('.research-history__empty');
      expect(emptyState).toBeTruthy();
    });

    it('should display empty state message', () => {
      const emptyText = fixture.nativeElement.querySelector('.empty-text');
      expect(emptyText.textContent).toContain('No research history yet');
    });

    it('should not display history items when empty', () => {
      const items = fixture.nativeElement.querySelectorAll('.history-item');
      expect(items.length).toBe(0);
    });
  });

  describe('Loading State', () => {
    beforeEach(() => {
      // Re-create mock with loading state
      logsServiceMock = jasmine.createSpyObj('LogsService', ['loadSessions'], {
        sessions: signal([]),
        isLoadingSessions: signal(true),
        error: signal(null)
      });
      TestBed.overrideProvider(LogsService, { useValue: logsServiceMock });
      fixture = TestBed.createComponent(ResearchHistoryComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should display loading indicator', () => {
      const loading = fixture.nativeElement.querySelector('.research-history__loading');
      expect(loading).toBeTruthy();
    });

    it('should display loading spinner', () => {
      const spinner = fixture.nativeElement.querySelector('.loading-spinner');
      expect(spinner).toBeTruthy();
    });

    it('should not display history items while loading', () => {
      const items = fixture.nativeElement.querySelectorAll('.history-item');
      expect(items.length).toBe(0);
    });
  });

  describe('Error State', () => {
    beforeEach(() => {
      // Re-create mock with error state
      logsServiceMock = jasmine.createSpyObj('LogsService', ['loadSessions'], {
        sessions: signal(mockSessions),
        isLoadingSessions: signal(false),
        error: signal('Failed to load sessions')
      });
      TestBed.overrideProvider(LogsService, { useValue: logsServiceMock });
      fixture = TestBed.createComponent(ResearchHistoryComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should display error message', () => {
      const error = fixture.nativeElement.querySelector('.research-history__error');
      expect(error).toBeTruthy();
    });

    it('should display correct error text', () => {
      const errorText = fixture.nativeElement.querySelector('.error-text');
      expect(errorText.textContent).toContain('Failed to load sessions');
    });
  });

  describe('Expand/Collapse Functionality', () => {
    it('should start with all items collapsed', () => {
      const expandedItems = fixture.nativeElement.querySelectorAll('.history-item--expanded');
      expect(expandedItems.length).toBe(0);
    });

    it('should expand item when toggle button clicked', () => {
      const toggleButton = fixture.nativeElement.querySelector('.history-item__toggle');
      toggleButton.click();
      fixture.detectChanges();

      expect(component.isExpanded('log-1')).toBe(true);
      const expandedItem = fixture.nativeElement.querySelector('.history-item--expanded');
      expect(expandedItem).toBeTruthy();
    });

    it('should collapse item when toggle button clicked again', () => {
      component.toggleItem('log-1');
      fixture.detectChanges();
      expect(component.isExpanded('log-1')).toBe(true);

      component.toggleItem('log-1');
      fixture.detectChanges();
      expect(component.isExpanded('log-1')).toBe(false);
    });

    it('should update chevron icon when expanded', () => {
      const toggleButton = fixture.nativeElement.querySelector('.history-item__toggle');
      const chevron = toggleButton.querySelector('.toggle-icon');

      expect(chevron.textContent).toContain('▶');

      toggleButton.click();
      fixture.detectChanges();

      expect(chevron.textContent).toContain('▼');
    });

    it('should support keyboard interaction (Enter key)', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.handleKeydown(event, 'log-1');
      expect(component.isExpanded('log-1')).toBe(true);
    });

    it('should support keyboard interaction (Space key)', () => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      spyOn(event, 'preventDefault');
      component.handleKeydown(event, 'log-1');
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.isExpanded('log-1')).toBe(true);
    });

    it('should show answer preview when collapsed', () => {
      const preview = fixture.nativeElement.querySelector('.history-item__preview');
      expect(preview).toBeTruthy();
    });

    it('should show full answer when expanded', () => {
      component.toggleItem('log-1');
      fixture.detectChanges();

      const fullAnswer = fixture.nativeElement.querySelector('.history-item__answer');
      expect(fullAnswer).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should navigate to logs page with logId when "View details" clicked', () => {
      const detailsLink = fixture.nativeElement.querySelector('.meta-link');
      detailsLink.click();

      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/logs'],
        { queryParams: { logId: 'log-1' } }
      );
    });

    it('should have correct routerLink on all detail links', () => {
      const detailsLinks = fixture.nativeElement.querySelectorAll('.meta-link');
      expect(detailsLinks.length).toBe(3);

      detailsLinks.forEach((link: HTMLElement) => {
        expect(link.getAttribute('ng-reflect-router-link')).toBe('/logs');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on toggle buttons', () => {
      const toggleButton = fixture.nativeElement.querySelector('.history-item__toggle');
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
      expect(toggleButton.getAttribute('aria-label')).toContain('Toggle details');
    });

    it('should update aria-expanded when item is expanded', () => {
      const toggleButton = fixture.nativeElement.querySelector('.history-item__toggle');
      toggleButton.click();
      fixture.detectChanges();

      expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
    });

    it('should have aria-controls linking to content', () => {
      const toggleButton = fixture.nativeElement.querySelector('.history-item__toggle');
      const contentId = toggleButton.getAttribute('aria-controls');
      const content = fixture.nativeElement.querySelector(`#${contentId}`);
      expect(content).toBeTruthy();
    });

    it('should have proper ARIA labels on links', () => {
      const detailsLink = fixture.nativeElement.querySelector('.meta-link');
      expect(detailsLink.getAttribute('aria-label')).toContain('View detailed logs');
    });

    it('should have role="status" on loading indicator', () => {
      logsServiceMock.isLoadingSessions = signal(true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('.loading-spinner');
      expect(spinner.getAttribute('role')).toBe('status');
    });

    it('should have role="alert" on error message', () => {
      logsServiceMock.error = signal('Error message');
      fixture.detectChanges();

      const error = fixture.nativeElement.querySelector('.research-history__error');
      expect(error.getAttribute('role')).toBe('alert');
    });

    it('should use sr-only class for screen reader text', () => {
      const srOnly = fixture.nativeElement.querySelectorAll('.sr-only');
      expect(srOnly.length).toBeGreaterThan(0);
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format recent timestamps as "X hours ago"', () => {
      const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(component.formatTimestamp(date)).toContain('hours ago');
    });

    it('should format yesterday correctly', () => {
      const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(component.formatTimestamp(date)).toBe('Yesterday');
    });

    it('should format dates within a week as "X days ago"', () => {
      const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(component.formatTimestamp(date)).toContain('days ago');
    });

    it('should format very recent timestamps as "Just now"', () => {
      const date = new Date();
      expect(component.formatTimestamp(date)).toBe('Just now');
    });

    it('should format old dates with month and day', () => {
      const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const formatted = component.formatTimestamp(date);
      expect(formatted).toMatch(/[A-Za-z]{3} \d{1,2}/);
    });
  });

  describe('Answer Preview', () => {
    it('should truncate long answers', () => {
      const longAnswer = 'a'.repeat(200);
      const preview = component.getAnswerPreview(longAnswer, 100);
      expect(preview.length).toBeLessThanOrEqual(104); // 100 + '...'
      expect(preview).toContain('...');
    });

    it('should not truncate short answers', () => {
      const shortAnswer = 'Short answer';
      const preview = component.getAnswerPreview(shortAnswer, 100);
      expect(preview).toBe(shortAnswer);
    });

    it('should handle empty answers', () => {
      const preview = component.getAnswerPreview('', 100);
      expect(preview).toBe('No answer available');
    });

    it('should respect custom maxLength', () => {
      const answer = 'a'.repeat(200);
      const preview = component.getAnswerPreview(answer, 50);
      expect(preview.length).toBeLessThanOrEqual(54); // 50 + '...'
    });
  });

  describe('Track By Function', () => {
    it('should track items by logId', () => {
      const item = component.historyItems()[0];
      expect(component.trackByLogId(0, item)).toBe('log-1');
    });
  });

  describe('Responsive Design', () => {
    it('should render correctly on mobile', () => {
      // Simulate mobile viewport
      window.innerWidth = 500;
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();

      const historyItems = fixture.nativeElement.querySelectorAll('.history-item');
      expect(historyItems.length).toBeGreaterThan(0);
    });
  });
});
