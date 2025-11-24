import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AgentActivityViewComponent } from './agent-activity-view.component';
import { AgentActivityService } from '../../../../core/services/agent-activity.service';
import { signal, WritableSignal } from '@angular/core';
import { ActivityTask } from '../../../../models';

describe('AgentActivityViewComponent', () => {
  let component: AgentActivityViewComponent;
  let fixture: ComponentFixture<AgentActivityViewComponent>;
  let mockActivityService: Partial<AgentActivityService>;
  let connectSpy: jasmine.Spy;
  let disconnectSpy: jasmine.Spy;

  const createMockTask = (overrides?: Partial<ActivityTask>): ActivityTask => ({
    id: 'task-1',
    nodeId: 'node-1',
    stage: 1,
    type: 'milestone',
    description: 'Test task description',
    progress: 50,
    status: 'running',
    timestamp: new Date(),
    retryCount: 0,
    canRetry: false,
    ...overrides
  });

  beforeEach(async () => {
    // Create spies for methods
    connectSpy = jasmine.createSpy('connectToStream');
    disconnectSpy = jasmine.createSpy('disconnect');

    // Create mock service with signals
    mockActivityService = {
      currentStage: signal(1),
      activeTasks: signal<ActivityTask[]>([]),
      completedTasks: signal<ActivityTask[]>([]),
      stageProgress: signal(0),
      isComplete: signal(false),
      isConnected: signal(false),
      connectionError: signal<string | null>(null),
      connectToStream: connectSpy,
      disconnect: disconnectSpy
    };

    await TestBed.configureTestingModule({
      imports: [AgentActivityViewComponent],
      providers: [
        { provide: AgentActivityService, useValue: mockActivityService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AgentActivityViewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should connect to stream on init with logId', () => {
      fixture.componentRef.setInput('logId', 'test-log-123');
      fixture.detectChanges();

      component.ngOnInit();

      expect(connectSpy).toHaveBeenCalledWith('test-log-123');
    });

    it('should disconnect on destroy', () => {
      component.ngOnDestroy();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner when not connected and no error', () => {
      (mockActivityService.isConnected as WritableSignal<boolean>).set(false);
      (mockActivityService.connectionError as WritableSignal<string | null>).set(null);
      fixture.componentRef.setInput('logId', 'test-log-123');
      fixture.detectChanges();

      const loadingElement = fixture.nativeElement.querySelector('.agent-activity-view__loading');
      const spinner = fixture.nativeElement.querySelector('.loading-spinner');

      expect(loadingElement).toBeTruthy();
      expect(spinner).toBeTruthy();
      expect(loadingElement.textContent).toContain('Connecting to research agent');
    });

    it('should hide loading spinner when connected', () => {
      (mockActivityService.isConnected as WritableSignal<boolean>).set(true);
      fixture.componentRef.setInput('logId', 'test-log-123');
      fixture.detectChanges();

      const loadingElement = fixture.nativeElement.querySelector('.agent-activity-view__loading');
      expect(loadingElement).toBeFalsy();
    });
  });

  describe('Connection Error', () => {
    it('should show error banner when connection error exists', () => {
      (mockActivityService.connectionError as WritableSignal<string | null>).set('Connection lost. Reconnecting...');
      fixture.componentRef.setInput('logId', 'test-log-123');
      fixture.detectChanges();

      const errorBanner = fixture.nativeElement.querySelector('.agent-activity-view__error-banner');
      expect(errorBanner).toBeTruthy();
      expect(errorBanner.textContent).toContain('Connection lost. Reconnecting...');
    });

    it('should hide error banner when no error', () => {
      (mockActivityService.connectionError as WritableSignal<string | null>).set(null);
      (mockActivityService.isConnected as WritableSignal<boolean>).set(true);
      fixture.componentRef.setInput('logId', 'test-log-123');
      fixture.detectChanges();

      const errorBanner = fixture.nativeElement.querySelector('.agent-activity-view__error-banner');
      expect(errorBanner).toBeFalsy();
    });
  });

  describe('Content Display', () => {
    beforeEach(() => {
      (mockActivityService.isConnected as WritableSignal<boolean>).set(true);
      fixture.componentRef.setInput('logId', 'test-log-123');
    });

    it('should display StageProgressHeader when connected', () => {
      (mockActivityService.currentStage as WritableSignal<number>).set(2);
      (mockActivityService.stageProgress as WritableSignal<number>).set(75);
      fixture.detectChanges();

      const stageHeader = fixture.nativeElement.querySelector('app-stage-progress-header');
      expect(stageHeader).toBeTruthy();
    });

    it('should display active tasks section', () => {
      fixture.detectChanges();

      const activeTasksHeading = fixture.nativeElement.querySelector('#active-tasks-heading');
      expect(activeTasksHeading).toBeTruthy();
      expect(activeTasksHeading.textContent).toContain('Active Tasks');
    });

    it('should show empty state when no active tasks', () => {
      (mockActivityService.activeTasks as WritableSignal<ActivityTask[]>).set([]);
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('Waiting for tasks');
    });

    it('should display active tasks when available', () => {
      const mockTask = createMockTask();
      (mockActivityService.activeTasks as WritableSignal<ActivityTask[]>).set([mockTask]);
      fixture.detectChanges();

      const taskCards = fixture.nativeElement.querySelectorAll('app-task-card');
      expect(taskCards.length).toBe(1);
    });

    it('should display task count for active tasks', () => {
      const mockTasks = [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' })
      ];
      (mockActivityService.activeTasks as WritableSignal<ActivityTask[]>).set(mockTasks);
      fixture.detectChanges();

      const taskCount = fixture.nativeElement.querySelector('#active-tasks-heading .task-count');
      expect(taskCount).toBeTruthy();
      expect(taskCount.textContent).toContain('(2)');
    });
  });

  describe('Completed Tasks Section', () => {
    beforeEach(() => {
      (mockActivityService.isConnected as WritableSignal<boolean>).set(true);
      fixture.componentRef.setInput('logId', 'test-log-123');
    });

    it('should not show completed section when no completed tasks', () => {
      (mockActivityService.completedTasks as WritableSignal<ActivityTask[]>).set([]);
      fixture.detectChanges();

      const completedSection = fixture.nativeElement.querySelector('.tasks-section--completed');
      expect(completedSection).toBeFalsy();
    });

    it('should show completed section when completed tasks exist', () => {
      const completedTask = createMockTask({ status: 'completed', progress: 100 });
      (mockActivityService.completedTasks as WritableSignal<ActivityTask[]>).set([completedTask]);
      fixture.detectChanges();

      const completedSection = fixture.nativeElement.querySelector('.tasks-section--completed');
      expect(completedSection).toBeTruthy();
    });

    it('should toggle completed tasks visibility', () => {
      const completedTask = createMockTask({ status: 'completed', progress: 100 });
      (mockActivityService.completedTasks as WritableSignal<ActivityTask[]>).set([completedTask]);
      fixture.detectChanges();

      expect(component.showCompletedTasks()).toBe(false);

      component.toggleCompletedTasks();
      expect(component.showCompletedTasks()).toBe(true);

      component.toggleCompletedTasks();
      expect(component.showCompletedTasks()).toBe(false);
    });

    it('should display correct chevron icon based on collapse state', () => {
      expect(component.getChevronIcon()).toBe('▶');

      component.showCompletedTasks.set(true);
      expect(component.getChevronIcon()).toBe('▼');
    });
  });

  describe('Answer Section', () => {
    beforeEach(() => {
      (mockActivityService.isConnected as WritableSignal<boolean>).set(true);
      fixture.componentRef.setInput('logId', 'test-log-123');
    });

    it('should not show answer section when research is incomplete', () => {
      (mockActivityService.isComplete as WritableSignal<boolean>).set(false);
      fixture.detectChanges();

      const answerSection = fixture.nativeElement.querySelector('.agent-activity-view__answer-section');
      expect(answerSection).toBeFalsy();
    });

    it('should show answer section when research is complete', () => {
      (mockActivityService.isComplete as WritableSignal<boolean>).set(true);
      fixture.detectChanges();

      const answerSection = fixture.nativeElement.querySelector('.agent-activity-view__answer-section');
      expect(answerSection).toBeTruthy();
    });

    it('should display completion message in answer card', () => {
      (mockActivityService.isComplete as WritableSignal<boolean>).set(true);
      fixture.detectChanges();

      const answerCard = fixture.nativeElement.querySelector('.answer-card');
      expect(answerCard).toBeTruthy();
      expect(answerCard.textContent).toContain('Research Complete');
    });
  });

  describe('Event Handlers', () => {
    it('should emit retry event with task ID', () => {
      const taskId = 'task-123';
      let emittedTaskId: string | undefined;

      component.retry.subscribe((id: string) => {
        emittedTaskId = id;
      });

      component.handleRetry(taskId);

      expect(emittedTaskId).toBe(taskId);
    });
  });

  describe('TrackBy Function', () => {
    it('should return task id for trackBy', () => {
      const mockTask = createMockTask({ id: 'unique-task-id' });
      const result = component.trackByTaskId(0, mockTask);

      expect(result).toBe('unique-task-id');
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      (mockActivityService.isConnected as WritableSignal<boolean>).set(true);
      fixture.componentRef.setInput('logId', 'test-log-123');
    });

    it('should have proper ARIA labels', () => {
      fixture.detectChanges();

      const mainContainer = fixture.nativeElement.querySelector('.agent-activity-view');
      expect(mainContainer.getAttribute('role')).toBe('main');
      expect(mainContainer.getAttribute('aria-label')).toBe('Agent Activity View');
    });

    it('should have proper ARIA live regions', () => {
      fixture.detectChanges();

      const tasksList = fixture.nativeElement.querySelector('.tasks-list');
      expect(tasksList.getAttribute('aria-live')).toBe('polite');
    });

    it('should have keyboard accessible collapse button', () => {
      const completedTask = createMockTask({ status: 'completed' });
      (mockActivityService.completedTasks as WritableSignal<ActivityTask[]>).set([completedTask]);
      fixture.detectChanges();

      const collapseButton = fixture.nativeElement.querySelector('.section-heading--collapsible');
      expect(collapseButton.getAttribute('type')).toBe('button');
      expect(collapseButton.getAttribute('aria-expanded')).toBe('false');
      expect(collapseButton.getAttribute('aria-controls')).toBe('completed-tasks-list');
    });
  });
});
