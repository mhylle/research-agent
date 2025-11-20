import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResearchService } from '../../core/services/research.service';
import { SearchInputComponent } from './components/search-input/search-input';
import { LoadingIndicatorComponent } from './components/loading-indicator/loading-indicator';
import { ResultCardComponent } from './components/result-card/result-card';
import { ErrorMessageComponent } from './components/error-message/error-message';

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [
    CommonModule,
    SearchInputComponent,
    LoadingIndicatorComponent,
    ResultCardComponent,
    ErrorMessageComponent
  ],
  templateUrl: './research.html',
  styleUrl: './research.scss',
})
export class ResearchComponent {
  researchService = inject(ResearchService);

  async onQuerySubmitted(query: string): Promise<void> {
    await this.researchService.submitQuery(query);
  }

  onRetry(): void {
    const lastQuery = this.researchService.currentQuery();
    if (lastQuery) {
      this.onQuerySubmitted(lastQuery);
    }
  }

  onDismissError(): void {
    this.researchService.clearError();
  }
}
