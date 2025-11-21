import { Routes } from '@angular/router';
import { ResearchComponent } from './features/research/research';
import { LogsPageComponent } from './features/logs/logs-page/logs-page';

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
  }
];
