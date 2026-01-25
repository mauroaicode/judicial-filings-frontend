import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { redirectGuard } from './core/guards/redirect.guard';

export const routes: Routes = [
  // Redirect empty path - will be handled by guards
  {
    path: '',
    pathMatch: 'full',
    canActivate: [redirectGuard],
    loadChildren: () => import('./modules/auth/sign-in/sign-in.routes'), // Dummy, never reached
  },

  // Auth routes (only for guests - not authenticated users)
  {
    path: 'sign-in',
    canActivate: [guestGuard],
    loadChildren: () => import('./modules/auth/sign-in/sign-in.routes'),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadChildren: () =>
      import('./modules/auth/forgot-password/forgot-password.routes'),
  },

  // Admin routes (protected - only for authenticated users)
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/layouts/authenticated/authenticated.component').then(
        (m) => m.AuthenticatedLayoutComponent
      ),
    children: [
      {
        path: '',
        loadChildren: () =>
          import('./modules/admin/admin.routes').then((m) => m.default),
      },
    ],
  },

  // Catch all route - redirect to sign-in
  { path: '**', redirectTo: '/sign-in' },
];
