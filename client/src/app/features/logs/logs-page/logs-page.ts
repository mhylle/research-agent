import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { LogsService } from '../../../core/services/logs.service';
import { LogsListComponent } from '../components/logs-list/logs-list';
import { LogTimelineComponent } from '../components/log-timeline/log-timeline';

@Component({
  selector: 'app-logs-page',
  standalone: true,
  imports: [CommonModule, LogsListComponent, LogTimelineComponent],
  templateUrl: './logs-page.html',
  styleUrls: ['./logs-page.scss']
})
export class LogsPageComponent implements OnInit {
  logsService: LogsService = inject(LogsService);
  route: ActivatedRoute = inject(ActivatedRoute);

  ngOnInit() {
    this.logsService.loadSessions();

    // Handle route parameter for direct logId access
    this.route.params.subscribe(params => {
      const logId = params['logId'];
      if (logId && typeof logId === 'string') {
        this.logsService.selectSession(logId);
      }
    });
  }

  onSessionSelected(logId: string) {
    this.logsService.selectSession(logId);
  }

  onSearchChanged(term: string) {
    this.logsService.searchTerm.set(term);
  }
}
