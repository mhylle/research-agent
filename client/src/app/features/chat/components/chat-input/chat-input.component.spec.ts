import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ChatInputComponent } from './chat-input.component';

describe('ChatInputComponent', () => {
  let component: ChatInputComponent;
  let fixture: ComponentFixture<ChatInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatInputComponent, FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit messageSent event when valid content is sent', () => {
    spyOn(component.messageSent, 'emit');
    component.messageContent.set('Test message');

    component.onSend();

    expect(component.messageSent.emit).toHaveBeenCalledWith({
      content: 'Test message',
      researchEnabled: false
    });
  });

  it('should not emit messageSent event when content is empty', () => {
    spyOn(component.messageSent, 'emit');
    component.messageContent.set('   ');

    component.onSend();

    expect(component.messageSent.emit).not.toHaveBeenCalled();
  });

  it('should reset form after sending message', () => {
    component.messageContent.set('Test message');
    component.researchEnabled.set(true);

    component.onSend();

    expect(component.messageContent()).toBe('');
    expect(component.researchEnabled()).toBe(false);
  });

  it('should toggle research mode', () => {
    expect(component.researchEnabled()).toBe(false);

    component.toggleResearch();
    expect(component.researchEnabled()).toBe(true);

    component.toggleResearch();
    expect(component.researchEnabled()).toBe(false);
  });

  it('should send message on Ctrl+Enter', () => {
    spyOn(component, 'onSend');
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true
    });

    component.messageContent.set('Test message');
    component.onKeyDown(event);

    expect(component.onSend).toHaveBeenCalled();
  });

  it('should send message on Meta+Enter (Mac)', () => {
    spyOn(component, 'onSend');
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true
    });

    component.messageContent.set('Test message');
    component.onKeyDown(event);

    expect(component.onSend).toHaveBeenCalled();
  });

  it('should disable button when message is empty', () => {
    component.messageContent.set('');
    expect(component.isButtonDisabled).toBe(true);
  });

  it('should disable button when isLoading is true', () => {
    component.messageContent.set('Test message');
    component.isLoading = true;
    expect(component.isButtonDisabled).toBe(true);
  });

  it('should disable button when disabled is true', () => {
    component.messageContent.set('Test message');
    component.disabled = true;
    expect(component.isButtonDisabled).toBe(true);
  });

  it('should enable button when message is valid and not loading', () => {
    component.messageContent.set('Test message');
    component.isLoading = false;
    component.disabled = false;
    expect(component.isButtonDisabled).toBe(false);
  });
});
