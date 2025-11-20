import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResultCardComponent } from './result-card';
import { ResearchResult } from '../../../../models';

describe('ResultCardComponent', () => {
  let component: ResultCardComponent;
  let fixture: ComponentFixture<ResultCardComponent>;

  const mockResult: ResearchResult = {
    logId: 'test-123',
    query: 'test query',
    answer: 'test answer',
    sources: [
      {
        url: 'https://example.com',
        title: 'Test Source',
        relevance: 'high'
      }
    ],
    metadata: {
      totalExecutionTime: 5000,
      stages: []
    },
    timestamp: new Date()
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResultCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResultCardComponent);
    component = fixture.componentInstance;
    component.result = mockResult;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
