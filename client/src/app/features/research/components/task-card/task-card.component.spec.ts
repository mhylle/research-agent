import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskCardComponent } from './task-card.component';
import { ActivityTask } from '../../../../models/activity-task.model';

describe('TaskCardComponent', () => {
  let component: TaskCardComponent;
  let fixture: ComponentFixture<TaskCardComponent>;

  const mockTask: ActivityTask = {
    id: 'task-1',
    nodeId: 'node-1',
    stage: 1,
    type: 'milestone',
    description: 'Test task description',
    progress: 50,
    status: 'running',
    timestamp: new Date(),
    retryCount: 0,
    canRetry: false
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('task', mockTask);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display task description', () => {
    const compiled = fixture.nativeElement;
    const description = compiled.querySelector('.task-card__description');
    expect(description?.textContent).toContain('Test task description');
  });

  it('should show progress bar for running task', () => {
    expect(component.shouldShowProgress()).toBe(true);
    const progressBar = fixture.nativeElement.querySelector('.progress-bar');
    expect(progressBar).toBeTruthy();
  });

  it('should display correct progress percentage', () => {
    expect(component.getProgressPercentage()).toBe(50);
  });

  it('should apply correct status class', () => {
    const statusClass = component.getStatusClass();
    expect(statusClass).toBe('task-card--running');
  });

  it('should emit retry event when retry button clicked', () => {
    const errorTask: ActivityTask = {
      ...mockTask,
      status: 'error',
      canRetry: true,
      error: {
        message: 'Test error',
        timestamp: new Date()
      }
    };

    fixture.componentRef.setInput('task', errorTask);
    fixture.detectChanges();

    let emittedId: string | undefined;
    component.retry.subscribe((id: string) => {
      emittedId = id;
    });

    component.onRetryClick();
    expect(emittedId).toBe('task-1');
  });

  it('should format timestamp correctly', () => {
    const recentDate = new Date();
    const formatted = component.formatTimestamp(recentDate);
    expect(formatted).toBe('just now');
  });

  it('should format duration correctly', () => {
    const duration = 45000; // 45 seconds
    const formatted = component.formatDuration(duration);
    expect(formatted).toBe('45s');
  });

  it('should show retry button only for error state with canRetry', () => {
    const errorTask: ActivityTask = {
      ...mockTask,
      status: 'error',
      canRetry: true
    };

    fixture.componentRef.setInput('task', errorTask);
    fixture.detectChanges();

    const retryButton = fixture.nativeElement.querySelector('.task-card__retry-button');
    expect(retryButton).toBeTruthy();
  });

  it('should not show retry button for error state without canRetry', () => {
    const errorTask: ActivityTask = {
      ...mockTask,
      status: 'error',
      canRetry: false
    };

    fixture.componentRef.setInput('task', errorTask);
    fixture.detectChanges();

    const retryButton = fixture.nativeElement.querySelector('.task-card__retry-button');
    expect(retryButton).toBeFalsy();
  });

  it('should display error message when error exists', () => {
    const errorTask: ActivityTask = {
      ...mockTask,
      status: 'error',
      error: {
        message: 'Network timeout error',
        timestamp: new Date()
      },
      canRetry: false
    };

    fixture.componentRef.setInput('task', errorTask);
    fixture.detectChanges();

    const errorMessage = fixture.nativeElement.querySelector('.task-card__error-message');
    expect(errorMessage?.textContent).toContain('Network timeout error');
  });

  it('should display stage number', () => {
    const compiled = fixture.nativeElement;
    const stageElement = compiled.querySelector('.task-card__stage');
    expect(stageElement?.textContent).toContain('Stage 1');
  });

  it('should display retry count when greater than 0', () => {
    const retryingTask: ActivityTask = {
      ...mockTask,
      status: 'retrying',
      retryCount: 2
    };

    fixture.componentRef.setInput('task', retryingTask);
    fixture.detectChanges();

    const retryCount = fixture.nativeElement.querySelector('.task-card__retry-count');
    expect(retryCount?.textContent).toContain('Retry 2');
  });

  // Accessibility tests
  describe('Accessibility', () => {
    it('should have proper ARIA label on task card', () => {
      const taskCard = fixture.nativeElement.querySelector('.task-card');
      const ariaLabel = taskCard?.getAttribute('aria-label');
      expect(ariaLabel).toContain('Task: Test task description');
    });

    it('should have proper role attribute on task card', () => {
      const taskCard = fixture.nativeElement.querySelector('.task-card');
      const role = taskCard?.getAttribute('role');
      expect(role).toBe('article');
    });

    it('should have ARIA label on status icon', () => {
      const icon = fixture.nativeElement.querySelector('.task-card__icon');
      const ariaLabel = icon?.getAttribute('aria-label');
      expect(ariaLabel).toContain('Status: running');
    });

    it('should have proper ARIA attributes on progress bar', () => {
      const progressFill = fixture.nativeElement.querySelector('.progress-fill');
      expect(progressFill?.getAttribute('role')).toBe('progressbar');
      expect(progressFill?.getAttribute('aria-valuemin')).toBe('0');
      expect(progressFill?.getAttribute('aria-valuemax')).toBe('100');
      expect(progressFill?.getAttribute('aria-valuenow')).toBe('50');
    });

    it('should have aria-live region for progress percentage', () => {
      const percentage = fixture.nativeElement.querySelector('.progress-percentage');
      expect(percentage?.getAttribute('aria-live')).toBe('polite');
    });

    it('should have proper ARIA label on retry button', () => {
      const errorTask: ActivityTask = {
        ...mockTask,
        status: 'error',
        canRetry: true
      };

      fixture.componentRef.setInput('task', errorTask);
      fixture.detectChanges();

      const retryButton = fixture.nativeElement.querySelector('.task-card__retry-button');
      expect(retryButton?.getAttribute('aria-label')).toBe('Retry task');
    });

    it('should handle keyboard navigation on retry button', () => {
      const errorTask: ActivityTask = {
        ...mockTask,
        status: 'error',
        canRetry: true
      };

      fixture.componentRef.setInput('task', errorTask);
      fixture.detectChanges();

      const retryButton = fixture.nativeElement.querySelector('.task-card__retry-button');
      expect(retryButton?.tagName).toBe('BUTTON');
      expect(retryButton?.getAttribute('type')).toBe('button');
    });

    it('should handle invalid date gracefully', () => {
      const invalidDate = new Date('invalid');
      const formatted = component.formatTimestamp(invalidDate);
      expect(formatted).toBe('Invalid date');
    });
  });
});
