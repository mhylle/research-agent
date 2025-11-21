import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LogTimeline } from './log-timeline';

describe('LogTimeline', () => {
  let component: LogTimeline;
  let fixture: ComponentFixture<LogTimeline>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogTimeline]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LogTimeline);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
