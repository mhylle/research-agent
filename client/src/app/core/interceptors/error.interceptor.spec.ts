import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting()
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should map 404 to user-friendly message', (done) => {
    httpClient.get('/test').subscribe({
      error: (error) => {
        expect(error.message).toContain('not found');
        done();
      }
    });

    const req = httpMock.expectOne('/test');
    req.flush({}, { status: 404, statusText: 'Not Found' });
  });

  it('should map 500 to user-friendly message', (done) => {
    httpClient.get('/test').subscribe({
      error: (error) => {
        expect(error.message).toContain('Server error');
        done();
      }
    });

    const req = httpMock.expectOne('/test');
    req.flush({}, { status: 500, statusText: 'Internal Server Error' });
  });

  it('should map 400 to user-friendly message', (done) => {
    httpClient.get('/test').subscribe({
      error: (error) => {
        expect(error.message).toContain('Invalid request');
        done();
      }
    });

    const req = httpMock.expectOne('/test');
    req.flush({}, { status: 400, statusText: 'Bad Request' });
  });

  it('should use backend error message when available', (done) => {
    httpClient.get('/test').subscribe({
      error: (error) => {
        expect(error.message).toBe('Custom backend error');
        done();
      }
    });

    const req = httpMock.expectOne('/test');
    req.flush({ message: 'Custom backend error' }, { status: 500, statusText: 'Internal Server Error' });
  });

  it('should handle network errors', (done) => {
    httpClient.get('/test').subscribe({
      error: (error) => {
        expect(error.message).toContain('Cannot connect to server');
        done();
      }
    });

    const req = httpMock.expectOne('/test');
    req.flush({}, { status: 0, statusText: 'Unknown Error' });
  });
});
