import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@app/core/auth/auth.service';
import { ROLE_ROUTE_MAP, ROUTES_ADMIN } from '@app/core/constants/router.constant';
import type { RoleName } from '@app/core/constants/router.constant';

/**
 * Redirect Guard
 * Handles root path redirect based on authentication status
 */
export const redirectGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.accessToken;
  const user = authService.currentUser;

  // If user is authenticated, redirect to their dashboard
  if (token && user) {
    const userRoles = user?.roles ?? [];

    // Try to find a matching route for the user's roles
    for (const role of userRoles) {
      const roleName = role.value as RoleName;
      const routePath = ROLE_ROUTE_MAP[roleName];

      if (routePath) {
        await router.navigate([routePath]);
        return false;
      }
    }

    // Default to dashboard if no role matches
    await router.navigate([ROUTES_ADMIN.DASHBOARD]);
    return false;
  }

  // User is not authenticated, redirect to sign-in
  await router.navigate(['/sign-in']);
  return false;
};

