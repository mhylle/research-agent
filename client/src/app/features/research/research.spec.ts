import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ResearchComponent } from './research';

describe('ResearchComponent', () => {
  let component: ResearchComponent;
  let fixture: ComponentFixture<ResearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResearchComponent],
      providers: [provideHttpClient()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
