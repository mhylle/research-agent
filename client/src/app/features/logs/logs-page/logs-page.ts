import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { LogsService } from '../../../core/services/logs.service';
import { LogsListComponent } from '../components/logs-list/logs-list';
import { LogTimelineComponent } from '../components/log-timeline/log-timeline';
import { TimelineGraphComponent } from '../components/timeline-graph/timeline-graph';
import { QualityTimelineComponent } from '../../../shared/components/quality-timeline/quality-timeline.component';

@Component({
  selector: 'app-logs-page',
  imports: [CommonModule, RouterModule, LogsListComponent, LogTimelineComponent, TimelineGraphComponent, QualityTimelineComponent],
  templateUrl: './logs-page.html',
  styleUrls: ['./logs-page.scss']
})
export class LogsPageComponent implements OnInit {
  logsService: LogsService = inject(LogsService);
  route: ActivatedRoute = inject(ActivatedRoute);

  activeView: 'timeline' | 'graph' = 'timeline';

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
