import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResearchSidePanelComponent } from './research-side-panel.component';
import { Citation } from '../../../../models/conversation.model';

describe('ResearchSidePanelComponent', () => {
  let component: ResearchSidePanelComponent;
  let fixture: ComponentFixture<ResearchSidePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResearchSidePanelComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ResearchSidePanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default fallback values', () => {
    expect(component.isOpen()).toBe(false);
    expect(component.citations()).toEqual([]);
    expect(component.highlightedCitationIndex()).toBeNull();
    expect(component.isResearching()).toBe(false);
    expect(component.researchStage()).toBe('');
    expect(component.researchProgress()).toBe(0);
  });

  it('should close panel when close() is called', () => {
    // Trigger fallback mode by calling close
    component.close();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(false);
  });

  it('should open URL in new window', () => {
    const url = 'https://example.com';
    spyOn(window, 'open');

    component.openUrl(url);

    expect(window.open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
  });

  it('should track citations by index', () => {
    const citation: Citation = {
      index: 1,
      url: 'https://example.com',
      title: 'Test Title',
      snippet: 'Test snippet'
    };

    const result = component.trackByCitationIndex(0, citation);

    expect(result).toBe(1);
  });

  describe('computed signals', () => {
    it('should return fallback values when service is not available', () => {
      expect(component.isOpen()).toBe(false);
      expect(component.citations()).toEqual([]);
      expect(component.highlightedCitationIndex()).toBeNull();
      expect(component.isResearching()).toBe(false);
      expect(component.researchStage()).toBe('');
      expect(component.researchProgress()).toBe(0);
    });
  });

  describe('template rendering', () => {
    it('should not render panel when closed', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const panel = compiled.querySelector('.research-side-panel');

      expect(panel).toBeNull();
    });

    it('should not render overlay when closed', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const overlay = compiled.querySelector('.research-side-panel__overlay');

      expect(overlay).toBeNull();
    });
  });
});
