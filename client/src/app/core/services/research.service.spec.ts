import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ResearchService } from './research.service';
import { ResearchResult } from '../../models';

describe('ResearchService', () => {
  let service: ResearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ResearchService]
    });
    service = TestBed.inject(ResearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    // Clear localStorage after each test
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial signal values', () => {
    expect(service.isLoading()).toBe(false);
    expect(service.currentResult()).toBeNull();
    expect(service.error()).toBeNull();
    expect(service.history()).toEqual([]);
  });

  it('should submit query and update signals', async () => {
    const mockResult: ResearchResult = {
      logId: 'test-123',
      query: 'test query',
      answer: 'test answer',
      sources: [],
      metadata: { totalExecutionTime: 1000, stages: [] },
      timestamp: new Date()
    };

    const promise = service.submitQuery('test query');

    expect(service.isLoading()).toBe(true);

    const req = httpMock.expectOne(req => req.url.includes('/api/research/query'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ query: 'test query' });

    req.flush(mockResult);
    await promise;

    expect(service.isLoading()).toBe(false);
    expect(service.currentResult()).toBeTruthy();
    expect(service.history().length).toBe(1);
  });
});
