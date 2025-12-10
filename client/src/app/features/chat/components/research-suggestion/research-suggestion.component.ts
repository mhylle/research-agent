import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../../../../models/conversation.model';

@Component({
  selector: 'app-research-suggestion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './research-suggestion.component.html',
  styleUrls: ['./research-suggestion.component.scss']
})
export class ResearchSuggestionComponent {
  message = input.required<Message>();
  researchRequested = output<string>();

  onResearchClick(): void {
    const msg = this.message();
    this.researchRequested.emit(msg.content);
  }
}
