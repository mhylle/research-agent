import { Routes } from '@angular/router';
import { ResearchComponent } from './features/research/research';
import { LogsPageComponent } from './features/logs/logs-page/logs-page';
import { EvaluationDashboardComponent } from './features/evaluation-dashboard/evaluation-dashboard.component';
import { ResearchQualityInspectorComponent } from './features/logs/components/research-quality-inspector/research-quality-inspector';

export const routes: Routes = [
  {
    path: '',
    component: ResearchComponent
  },
  {
    path: 'logs',
    component: LogsPageComponent
  },
  {
    path: 'logs/:logId',
    component: LogsPageComponent
  },
  {
    path: 'quality-inspector/:logId',
    component: ResearchQualityInspectorComponent
  },
  {
    path: 'evaluation-dashboard',
    component: EvaluationDashboardComponent
  },
  {
    path: 'evaluation-dashboard/:id',
    component: EvaluationDashboardComponent
  }
];
