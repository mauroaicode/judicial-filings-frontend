import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('./clients.component').then((m) => m.ClientsComponent),
    data: {
      title: 'clients.title',
    },
  },
] as Routes;
