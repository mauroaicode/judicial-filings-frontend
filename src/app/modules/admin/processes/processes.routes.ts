import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('./processes.component').then((m) => m.ProcessesComponent),
    data: {
      title: 'processes.title',
    },
  },
] as Routes;
