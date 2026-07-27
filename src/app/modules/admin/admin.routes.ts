import { Routes } from '@angular/router';

export default [
  // Dashboard
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./dashboard/dashboard.routes').then((m) => m.default),
  },
  // Processes
  {
    path: 'processes',
    loadChildren: () =>
      import('./processes/processes.routes').then((m) => m.default),
  },
  // Organizations
  {
    path: 'organizations',
    loadChildren: () =>
      import('./clients/clients.routes').then((m) => m.default),
  },
  {
    path: 'import-history',
    loadChildren: () =>
      import('./import-history/import-history.routes').then((m) => m.default),
  },
  {
    path: 'judicial-sync',
    loadChildren: () =>
      import('./judicial-sync/judicial-sync.routes').then((m) => m.default),
  },
  {
    path: 'digest-packages',
    loadChildren: () =>
      import('./digest-packages/digest-packages.routes').then((m) => m.default),
  },
  // More admin routes will be added here as modules are created
  // Example structure for future modules with role guards:
  // {
  //   path: 'processes',
  //   canActivate: [rolesGuard],
  //   data: {
  //     roles: ['admin', 'magistrate'],
  //   },
  //   loadChildren: () =>
  //     import('./processes/processes.routes').then((m) => m.default),
  // },
  // {
  //   path: 'complainants',
  //   canActivate: [rolesGuard],
  //   data: {
  //     roles: ['admin', 'secretary'],
  //   },
  //   loadChildren: () =>
  //     import('./complainants/complainants.routes').then((m) => m.default),
  // },
] as Routes;

