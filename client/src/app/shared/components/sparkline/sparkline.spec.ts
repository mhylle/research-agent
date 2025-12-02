import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SparklineComponent } from './sparkline';

describe('SparklineComponent', () => {
  let component: SparklineComponent;
  let fixture: ComponentFixture<SparklineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SparklineComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SparklineComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should calculate delta correctly for increasing values', () => {
    component.data = [40, 70, 90];
    fixture.detectChanges();
    expect(component.delta()).toBe(50);
  });

  it('should calculate delta correctly for decreasing values', () => {
    component.data = [90, 70, 40];
    fixture.detectChanges();
    expect(component.delta()).toBe(-50);
  });

  it('should return null delta for single value', () => {
    component.data = [50];
    fixture.detectChanges();
    expect(component.delta()).toBeNull();
  });

  it('should return null delta for empty data', () => {
    component.data = [];
    fixture.detectChanges();
    expect(component.delta()).toBeNull();
  });

  it('should use moss color for positive trend', () => {
    component.data = [40, 70, 90];
    fixture.detectChanges();
    expect(component.lineColor()).toBe('#4d7c0f');
  });

  it('should use clay color for negative trend', () => {
    component.data = [90, 70, 40];
    fixture.detectChanges();
    expect(component.lineColor()).toBe('#ea580c');
  });

  it('should use slate color for no change', () => {
    component.data = [50, 50];
    fixture.detectChanges();
    expect(component.lineColor()).toBe('#64748b');
  });

  it('should generate correct tooltip text', () => {
    component.data = [42, 85, 100];
    fixture.detectChanges();
    expect(component.tooltipText()).toBe('Attempt 1: 42% → Attempt 2: 85% → Attempt 3: 100%');
  });

  it('should generate line path with correct points', () => {
    component.data = [0, 50, 100];
    fixture.detectChanges();
    const path = component.linePath();
    expect(path).toContain('M');
    expect(path).toContain('L');
  });

  it('should generate fill path with closed polygon', () => {
    component.data = [0, 50, 100];
    fixture.detectChanges();
    const path = component.fillPath();
    expect(path).toContain('M');
    expect(path).toContain('L');
    expect(path).toContain('Z'); // Closed path
  });

  it('should normalize points correctly within viewBox', () => {
    component.data = [0, 50, 100];
    fixture.detectChanges();

    // Access private method via type assertion
    const points = (component as any).normalizePoints();

    expect(points.length).toBe(3);
    expect(points[0].x).toBe(0);
    expect(points[points.length - 1].x).toBe(40); // viewWidth

    // All y values should be within viewHeight range
    points.forEach((point: any) => {
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(16);
    });
  });
});
