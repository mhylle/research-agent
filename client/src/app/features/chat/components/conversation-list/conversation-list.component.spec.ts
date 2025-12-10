import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConversationListComponent } from './conversation-list.component';
import { ConversationService } from '../../../../core/services/conversation.service';
import { signal } from '@angular/core';

describe('ConversationListComponent', () => {
  let component: ConversationListComponent;
  let fixture: ComponentFixture<ConversationListComponent>;
  let conversationService: jasmine.SpyObj<ConversationService>;

  beforeEach(async () => {
    // Create mock service
    const conversationServiceSpy = jasmine.createSpyObj('ConversationService', [
      'loadConversations',
      'createConversation',
      'deleteConversation',
      'searchConversations'
    ]);

    // Mock service signals
    conversationServiceSpy.conversations = signal([]);
    conversationServiceSpy.isLoading = signal(false);
    conversationServiceSpy.error = signal(null);

    await TestBed.configureTestingModule({
      imports: [ConversationListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConversationService, useValue: conversationServiceSpy }
      ]
    }).compileComponents();

    conversationService = TestBed.inject(ConversationService) as jasmine.SpyObj<ConversationService>;
    fixture = TestBed.createComponent(ConversationListComponent);
    component = fixture.componentInstance;

    // Set required input
    fixture.componentRef.setInput('userId', 'test-user-id');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load conversations on init', () => {
    fixture.detectChanges();
    expect(conversationService.loadConversations).toHaveBeenCalledWith('test-user-id');
  });

  it('should format timestamps correctly', () => {
    const now = new Date();
    const justNow = new Date(now.getTime() - 30000); // 30 seconds ago
    const oneHour = new Date(now.getTime() - 3600000); // 1 hour ago
    const yesterday = new Date(now.getTime() - 86400000); // 1 day ago

    expect(component.formatTimestamp(justNow)).toBe('Just now');
    expect(component.formatTimestamp(oneHour)).toBe('1 hour ago');
    expect(component.formatTimestamp(yesterday)).toBe('Yesterday');
  });

  it('should truncate long titles', () => {
    const shortTitle = 'Short';
    const longTitle = 'This is a very long title that should be truncated to fit the UI constraints';

    expect(component.truncateTitle(shortTitle)).toBe(shortTitle);
    expect(component.truncateTitle(longTitle, 20)).toBe('This is a very long...');
  });

  it('should emit conversationSelected when conversation is selected', () => {
    spyOn(component.conversationSelected, 'emit');
    component.onSelectConversation('conversation-123');
    expect(component.conversationSelected.emit).toHaveBeenCalledWith('conversation-123');
  });

  it('should call deleteConversation on service when delete is confirmed', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    conversationService.deleteConversation.and.returnValue(Promise.resolve());

    const event = new Event('click');
    await component.onDeleteConversation(event, 'conversation-123');

    expect(conversationService.deleteConversation).toHaveBeenCalledWith('conversation-123');
  });

  it('should not delete conversation when confirmation is cancelled', async () => {
    spyOn(window, 'confirm').and.returnValue(false);

    const event = new Event('click');
    await component.onDeleteConversation(event, 'conversation-123');

    expect(conversationService.deleteConversation).not.toHaveBeenCalled();
  });

  it('should debounce search queries', (done) => {
    conversationService.searchConversations.and.returnValue(Promise.resolve());

    component.onSearch('test query');
    component.onSearch('test query 2');
    component.onSearch('test query 3');

    // Wait for debounce delay
    setTimeout(() => {
      expect(conversationService.searchConversations).toHaveBeenCalledTimes(1);
      expect(conversationService.searchConversations).toHaveBeenCalledWith('test-user-id', 'test query 3');
      done();
    }, 400);
  });

  it('should reload conversations when search is cleared', (done) => {
    conversationService.loadConversations.and.returnValue(Promise.resolve());

    component.onSearch('');

    setTimeout(() => {
      expect(conversationService.loadConversations).toHaveBeenCalledWith('test-user-id');
      done();
    }, 400);
  });
});
