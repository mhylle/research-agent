import { Routes } from '@angular/router';

export const chatRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./chat.component').then(m => m.ChatComponent)
  },
  {
    path: ':conversationId',
    loadComponent: () => import('./chat.component').then(m => m.ChatComponent)
  }
];
