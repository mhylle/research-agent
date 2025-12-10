import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatThreadComponent } from './chat-thread.component';
import { MarkdownService } from '../../../../core/services/markdown.service';
import { Message } from '../../../../models/conversation.model';

describe('ChatThreadComponent', () => {
  let component: ChatThreadComponent;
  let fixture: ComponentFixture<ChatThreadComponent>;
  let markdownService: jasmine.SpyObj<MarkdownService>;

  const mockMessages: Message[] = [
    {
      id: '1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello, how are you?',
      messageOptions: { researchEnabled: false },
      tokenCount: 10,
      createdAt: new Date(),
    },
    {
      id: '2',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'I am doing well, thank you!',
      messageOptions: { researchEnabled: false },
      tokenCount: 15,
      createdAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const markdownServiceSpy = jasmine.createSpyObj('MarkdownService', [
      'parseToSafeHtml',
    ]);

    await TestBed.configureTestingModule({
      imports: [ChatThreadComponent],
      providers: [{ provide: MarkdownService, useValue: markdownServiceSpy }],
    }).compileComponents();

    markdownService = TestBed.inject(
      MarkdownService
    ) as jasmine.SpyObj<MarkdownService>;
    fixture = TestBed.createComponent(ChatThreadComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display empty state when no messages', () => {
    fixture.componentRef.setInput('messages', []);
    fixture.componentRef.setInput('isStreaming', false);
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector(
      '.chat-thread__empty'
    );
    expect(emptyState).toBeTruthy();
  });

  it('should display messages when provided', () => {
    fixture.componentRef.setInput('messages', mockMessages);
    fixture.detectChanges();

    const messageElements = fixture.nativeElement.querySelectorAll(
      '.chat-thread__message'
    );
    expect(messageElements.length).toBe(mockMessages.length);
  });

  it('should apply correct role-based styling', () => {
    fixture.componentRef.setInput('messages', mockMessages);
    fixture.detectChanges();

    const userMessage = fixture.nativeElement.querySelector(
      '.chat-thread__message--user'
    );
    const assistantMessage = fixture.nativeElement.querySelector(
      '.chat-thread__message--assistant'
    );

    expect(userMessage).toBeTruthy();
    expect(assistantMessage).toBeTruthy();
  });

  it('should show typing indicator when streaming without content', () => {
    fixture.componentRef.setInput('messages', []);
    fixture.componentRef.setInput('isStreaming', true);
    fixture.componentRef.setInput('streamingContent', '');
    fixture.detectChanges();

    const typingIndicator = fixture.nativeElement.querySelector(
      '.chat-thread__typing-indicator'
    );
    expect(typingIndicator).toBeTruthy();
  });

  it('should display streaming content when provided', () => {
    fixture.componentRef.setInput('messages', []);
    fixture.componentRef.setInput('isStreaming', true);
    fixture.componentRef.setInput('streamingContent', 'Streaming text...');
    fixture.detectChanges();

    const messageBody = fixture.nativeElement.querySelector(
      '.chat-thread__message-body'
    );
    expect(messageBody).toBeTruthy();
  });

  it('should format timestamps correctly', () => {
    const now = new Date();
    const justNow = new Date(now.getTime() - 30000); // 30 seconds ago

    expect(component.formatTimestamp(justNow)).toBe('Just now');
  });

  it('should track messages by id', () => {
    const message = mockMessages[0];
    const trackId = component.trackByMessageId(0, message);

    expect(trackId).toBe(message.id);
  });
});
