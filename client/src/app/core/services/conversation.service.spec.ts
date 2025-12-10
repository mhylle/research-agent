import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ConversationService } from './conversation.service';
import { environment } from '../../../environments/environment';
import {
  Conversation,
  PaginatedConversations,
  CreateConversationDto,
  UpdateConversationDto
} from '../../models/conversation.model';

describe('ConversationService', () => {
  let service: ConversationService;
  let httpMock: HttpTestingController;
  const apiUrl = `${environment.apiUrl}/conversations`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ConversationService]
    });
    service = TestBed.inject(ConversationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadConversations', () => {
    it('should load conversations successfully', async () => {
      const userId = 'user123';
      const mockResponse: PaginatedConversations = {
        data: [
          {
            id: '1',
            userId: 'user123',
            title: 'Test Conversation',
            tokenCount: 100,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1
      };

      const promise = service.loadConversations(userId);

      const req = httpMock.expectOne(
        `${apiUrl}?userId=${userId}&page=1&pageSize=20`
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      await promise;

      expect(service.conversations().length).toBe(1);
      expect(service.totalConversations()).toBe(1);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should handle errors', async () => {
      const userId = 'user123';

      const promise = service.loadConversations(userId);

      const req = httpMock.expectOne(
        `${apiUrl}?userId=${userId}&page=1&pageSize=20`
      );
      req.error(new ProgressEvent('error'));

      await promise;

      expect(service.error()).toBeTruthy();
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('createConversation', () => {
    it('should create a conversation successfully', async () => {
      const dto: CreateConversationDto = {
        userId: 'user123',
        title: 'New Conversation'
      };

      const mockConversation: Conversation = {
        id: '1',
        userId: 'user123',
        title: 'New Conversation',
        tokenCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const promise = service.createConversation(dto);

      const req = httpMock.expectOne(apiUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);
      req.flush(mockConversation);

      const result = await promise;

      expect(result).toEqual(mockConversation);
      expect(service.conversations().length).toBe(1);
      expect(service.totalConversations()).toBe(1);
    });
  });

  describe('selectConversation', () => {
    it('should load a conversation with messages', async () => {
      const conversationId = '1';
      const mockConversation: Conversation = {
        id: '1',
        userId: 'user123',
        title: 'Test Conversation',
        tokenCount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          {
            id: 'm1',
            conversationId: '1',
            role: 'user',
            content: 'Hello',
            messageOptions: { researchEnabled: false },
            tokenCount: 10,
            createdAt: new Date()
          }
        ]
      };

      const promise = service.selectConversation(conversationId);

      const req = httpMock.expectOne(`${apiUrl}/${conversationId}`);
      expect(req.request.method).toBe('GET');
      req.flush(mockConversation);

      await promise;

      expect(service.currentConversation()).toBeTruthy();
      expect(service.currentConversation()?.messages?.length).toBe(1);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation successfully', async () => {
      // Setup initial state
      service.conversations.set([
        {
          id: '1',
          userId: 'user123',
          title: 'Test',
          tokenCount: 100,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      service.totalConversations.set(1);

      const promise = service.deleteConversation('1');

      const req = httpMock.expectOne(`${apiUrl}/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});

      await promise;

      expect(service.conversations().length).toBe(0);
      expect(service.totalConversations()).toBe(0);
    });
  });

  describe('updateTitle', () => {
    it('should update conversation title successfully', async () => {
      // Setup initial state
      service.conversations.set([
        {
          id: '1',
          userId: 'user123',
          title: 'Old Title',
          tokenCount: 100,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      const promise = service.updateTitle('1', 'New Title');

      const req = httpMock.expectOne(`${apiUrl}/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ title: 'New Title' });
      req.flush({ id: '1', title: 'New Title' });

      await promise;

      expect(service.conversations()[0].title).toBe('New Title');
    });
  });

  describe('searchConversations', () => {
    it('should search conversations successfully', async () => {
      const userId = 'user123';
      const query = 'test';
      const mockResponse: PaginatedConversations = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0
      };

      const promise = service.searchConversations(userId, query);

      const req = httpMock.expectOne(
        `${apiUrl}?userId=${userId}&search=${query}&page=1&pageSize=20`
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      await promise;

      expect(service.conversations().length).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('should clear error', () => {
      service.error.set('Test error');
      service.clearError();
      expect(service.error()).toBeNull();
    });

    it('should clear current conversation', () => {
      service.currentConversation.set({
        id: '1',
        userId: 'user123',
        title: 'Test',
        tokenCount: 100,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      service.clearCurrentConversation();
      expect(service.currentConversation()).toBeNull();
    });
  });
});
