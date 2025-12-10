import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InlineCitationComponent } from './inline-citation.component';
import { Citation } from '../../../../models/conversation.model';

describe('InlineCitationComponent', () => {
  let component: InlineCitationComponent;
  let fixture: ComponentFixture<InlineCitationComponent>;

  const mockCitation: Citation = {
    index: 1,
    url: 'https://example.com/article',
    title: 'Example Article Title',
    snippet: 'This is a sample snippet from the article.'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InlineCitationComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(InlineCitationComponent);
    component = fixture.componentInstance;
    component.citation = mockCitation;
    component.index = 1;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display citation index', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const citationSpan = compiled.querySelector('.inline-citation');
    expect(citationSpan?.textContent?.trim()).toContain('[1]');
  });

  it('should emit citationClicked event when clicked', () => {
    spyOn(component.citationClicked, 'emit');

    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;
    citationSpan.click();

    expect(component.citationClicked.emit).toHaveBeenCalledWith(mockCitation);
  });

  it('should show tooltip on mouse enter', () => {
    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;

    expect(component.showTooltip()).toBe(false);

    citationSpan.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(component.showTooltip()).toBe(true);

    const tooltip = fixture.nativeElement.querySelector('.inline-citation__tooltip');
    expect(tooltip).toBeTruthy();
  });

  it('should hide tooltip on mouse leave', () => {
    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;

    // Show tooltip first
    citationSpan.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(component.showTooltip()).toBe(true);

    // Hide tooltip
    citationSpan.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(component.showTooltip()).toBe(false);
  });

  it('should display citation title and url in tooltip', () => {
    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;
    citationSpan.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.inline-citation__tooltip-title');
    const url = fixture.nativeElement.querySelector('.inline-citation__tooltip-url');

    expect(title?.textContent).toContain(mockCitation.title);
    expect(url?.textContent).toContain(mockCitation.url);
  });

  it('should handle keyboard navigation (Enter key)', () => {
    spyOn(component.citationClicked, 'emit');

    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;
    const keyboardEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    citationSpan.dispatchEvent(keyboardEvent);

    expect(component.citationClicked.emit).toHaveBeenCalledWith(mockCitation);
  });

  it('should handle keyboard navigation (Space key)', () => {
    spyOn(component.citationClicked, 'emit');

    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;
    const keyboardEvent = new KeyboardEvent('keydown', { key: ' ' });
    citationSpan.dispatchEvent(keyboardEvent);

    expect(component.citationClicked.emit).toHaveBeenCalledWith(mockCitation);
  });

  it('should apply active class when highlighted', () => {
    component.highlightedIndex = 1;
    fixture.detectChanges();

    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;
    expect(citationSpan.classList.contains('inline-citation--active')).toBe(true);
  });

  it('should not apply active class when not highlighted', () => {
    component.highlightedIndex = 2;
    fixture.detectChanges();

    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;
    expect(citationSpan.classList.contains('inline-citation--active')).toBe(false);
  });

  it('should have proper accessibility attributes', () => {
    const citationSpan = fixture.nativeElement.querySelector('.inline-citation') as HTMLElement;

    expect(citationSpan.getAttribute('role')).toBe('button');
    expect(citationSpan.getAttribute('tabindex')).toBe('0');
    expect(citationSpan.getAttribute('aria-label')).toContain('Citation 1');
    expect(citationSpan.getAttribute('aria-label')).toContain(mockCitation.title);
  });
});
