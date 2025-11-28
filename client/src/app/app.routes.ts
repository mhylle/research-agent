import { Routes } from '@angular/router';
import { ResearchComponent } from './features/research/research';
import { LogsPageComponent } from './features/logs/logs-page/logs-page';
import { EvaluationDashboardComponent } from './features/evaluation-dashboard/evaluation-dashboard.component';

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
    path: 'evaluation-dashboard',
    component: EvaluationDashboardComponent
  },
  {
    path: 'evaluation-dashboard/:id',
    component: EvaluationDashboardComponent
  }
];
