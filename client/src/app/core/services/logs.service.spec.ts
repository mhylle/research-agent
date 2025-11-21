import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LogsService } from './logs.service';
import { LogSession } from '../../models';

describe('LogsService', () => {
  let service: LogsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LogsService]
    });
    service = TestBed.inject(LogsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load sessions', async () => {
    const mockSessions: LogSession[] = [
      { logId: 'test', query: 'test query', timestamp: '', totalDuration: 1000, stageCount: 3, toolCallCount: 2, status: 'completed' }
    ];

    const promise = service.loadSessions();

    const req = httpMock.expectOne(req => req.url.includes('/api/logs/sessions'));
    req.flush({ sessions: mockSessions, total: 1 });

    await promise;

    expect(service.sessions().length).toBe(1);
    expect(service.sessions()[0].logId).toBe('test');
  });
});
