import { Component, Output, EventEmitter, Input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface MessageSentEvent {
  content: string;
  researchEnabled: boolean;
}

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-input.component.html',
  styleUrl: './chat-input.component.scss'
})
export class ChatInputComponent {
  @Input() disabled = false;
  @Input() isLLMStreaming = false;
  @Output() messageSent = new EventEmitter<MessageSentEvent>();

  messageContent = signal('');
  researchEnabled = signal(false);

  onSend(): void {
    const content = this.messageContent().trim();
    if (content) {
      this.messageSent.emit({
        content,
        researchEnabled: this.researchEnabled()
      });
      this.messageContent.set('');
      this.researchEnabled.set(false);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.onSend();
    }
    // Shift+Enter allows newline (default behavior)
  }

  toggleResearch(): void {
    this.researchEnabled.update(enabled => !enabled);
  }

  autoResize(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  get isValid(): boolean {
    return this.messageContent().trim().length > 0;
  }

  get isButtonDisabled(): boolean {
    return !this.isValid || this.disabled || this.isLLMStreaming;
  }
}
