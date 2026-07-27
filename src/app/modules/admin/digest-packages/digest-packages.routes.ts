import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('./digest-packages.component').then((m) => m.DigestPackagesComponent),
    data: { title: 'digestPackages.title' },
  },
] as Routes;
