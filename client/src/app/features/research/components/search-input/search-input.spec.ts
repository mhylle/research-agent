import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchInputComponent } from './search-input';

describe('SearchInputComponent', () => {
  let component: SearchInputComponent;
  let fixture: ComponentFixture<SearchInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchInputComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit query on submit', () => {
    let emittedQuery = '';
    component.querySubmitted.subscribe(q => emittedQuery = q);

    component.query = 'test query';
    component.onSubmit();

    expect(emittedQuery).toBe('test query');
  });

  it('should not submit empty query', () => {
    let submitted = false;
    component.querySubmitted.subscribe(() => submitted = true);

    component.query = '   ';
    component.onSubmit();

    expect(submitted).toBe(false);
  });
});
