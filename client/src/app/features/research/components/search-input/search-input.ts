import { Component, Output, EventEmitter, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface QuerySubmitEvent {
  query: string;
  provider: 'azure' | 'local';
}

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-input.html',
  styleUrl: './search-input.scss'
})
export class SearchInputComponent {
  @Input() disabled = false;
  @Output() querySubmitted = new EventEmitter<QuerySubmitEvent>();

  query = '';
  selectedProvider: 'azure' | 'local' = 'azure';

  onSubmit(): void {
    const trimmedQuery = this.query.trim();
    if (trimmedQuery.length >= 3) {
      this.querySubmitted.emit({
        query: trimmedQuery,
        provider: this.selectedProvider
      });
    }
  }

  clearQuery(): void {
    this.query = '';
  }

  get characterCount(): number {
    return this.query.length;
  }

  get isValid(): boolean {
    return this.query.trim().length >= 3;
  }
}
