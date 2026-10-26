import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('./notification-digests.component').then((m) => m.NotificationDigestsComponent),
    data: { title: 'notificationDigests.title' },
  },
] as Routes;
