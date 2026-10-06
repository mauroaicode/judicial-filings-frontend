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
  {
    path: ':organizationId/exports',
    loadComponent: () =>
      import('../export-history/export-history.component').then((m) => m.ExportHistoryComponent),
    data: {
      title: 'historialExportaciones.orgTitle',
    },
  },
] as Routes;
