import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { ChatComponent } from './chat.component';
import { ConversationService } from '../../core/services/conversation.service';

describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;
  let mockConversationService: jasmine.SpyObj<ConversationService>;
  let mockActivatedRoute: any;

  beforeEach(async () => {
    // Create mock ConversationService
    mockConversationService = jasmine.createSpyObj('ConversationService', [
      'selectConversation',
      'loadConversations',
      'clearCurrentConversation'
    ]);

    // Add signal properties
    mockConversationService.conversations = signal([]);
    mockConversationService.currentConversation = signal(null);
    mockConversationService.isLoading = signal(false);
    mockConversationService.error = signal(null);

    // Create mock ActivatedRoute
    mockActivatedRoute = {
      params: of({ conversationId: 'test-123' })
    };

    await TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        { provide: ConversationService, useValue: mockConversationService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should extract conversationId from route params', (done) => {
    // Wait for effect to run
    setTimeout(() => {
      expect(component.conversationId()).toBe('test-123');
      done();
    }, 100);
  });

  it('should load conversation when conversationId is set', (done) => {
    // Wait for effect to run
    setTimeout(() => {
      expect(mockConversationService.selectConversation).toHaveBeenCalledWith('test-123');
      done();
    }, 100);
  });

  it('should handle null conversationId', () => {
    mockActivatedRoute.params = of({});
    component.ngOnInit();

    setTimeout(() => {
      expect(component.conversationId()).toBeNull();
    }, 100);
  });

  it('should display empty state when no conversation is selected', () => {
    component.conversationId.set(null);
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.chat-container__empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('Select or create a conversation');
  });

  it('should display active chat when conversation is selected', () => {
    component.conversationId.set('test-456');
    fixture.detectChanges();

    const activeChat = fixture.nativeElement.querySelector('.chat-container__active-chat');
    expect(activeChat).toBeTruthy();
    expect(activeChat.textContent).toContain('test-456');
  });
});
