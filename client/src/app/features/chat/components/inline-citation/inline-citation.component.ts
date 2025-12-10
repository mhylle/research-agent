import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Citation } from '../../../../models/conversation.model';

@Component({
  selector: 'app-inline-citation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inline-citation.component.html',
  styleUrl: './inline-citation.component.scss'
})
export class InlineCitationComponent {
  @Input({ required: true }) citation!: Citation;
  @Input({ required: true }) index!: number;
  @Input() highlightedIndex: number | null = null;
  @Output() citationClicked = new EventEmitter<Citation>();

  showTooltip = signal(false);

  isHighlighted = computed(() => this.highlightedIndex === this.index);

  onClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.citationClicked.emit(this.citation);
  }

  onMouseEnter(): void {
    this.showTooltip.set(true);
  }

  onMouseLeave(): void {
    this.showTooltip.set(false);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onClick(event);
    }
  }
}
