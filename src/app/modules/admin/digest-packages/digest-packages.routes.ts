import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

/** Compat: /organizations/:id → ?organization= en el listado (abre la modal). */
const redirectOrgPathToQuery: CanActivateFn = (route) => {
  const router = inject(Router);
  const organizationId = route.paramMap.get('organizationId');
  return router.createUrlTree(['/admin/digest-packages'], {
    queryParams: organizationId ? { organization: organizationId } : {},
  });
};

export default [
  {
    path: '',
    loadComponent: () =>
      import('./digest-packages.component').then((m) => m.DigestPackagesComponent),
    data: { title: 'digestPackages.title' },
  },
  {
    path: 'organizations/:organizationId',
    canActivate: [redirectOrgPathToQuery],
    // canActivate redirige; el componente no se llega a montar
    loadComponent: () =>
      import('./digest-packages.component').then((m) => m.DigestPackagesComponent),
  },
] as Routes;
