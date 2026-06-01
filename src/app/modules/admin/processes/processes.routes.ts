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
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/process-detail/process-detail.component').then(
        (m) => m.ProcessDetailComponent
      ),
    data: {
      title: 'processDetail.title',
    },
  },
] as Routes;
