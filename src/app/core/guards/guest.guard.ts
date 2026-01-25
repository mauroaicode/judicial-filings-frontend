import { inject } from '@angular/core';
import { AuthService } from '@app/core/auth/auth.service';
import { Router, type CanActivateFn } from '@angular/router';
import type { RoleName } from '@app/core/constants/router.constant';
import { ROLE_ROUTE_MAP, ROUTES_ADMIN } from '@app/core/constants/router.constant';

/**
 * Guest Guard
 * Prevents authenticated users from accessing guest routes (login, forgot password, etc.)
 * Redirects authenticated users to their dashboard based on their role
 */
export const guestGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.accessToken;
  const user = authService.currentUser;

  if (token && user) {
    const userRoles = user?.roles ?? [];

    for (const role of userRoles) {
      const roleName = role.value as RoleName;
      const routePath = ROLE_ROUTE_MAP[roleName];

      if (routePath) {
        await router.navigate([routePath]);
        return false;
      }
    }

    await router.navigate([ROUTES_ADMIN.DASHBOARD]);
    return false;
  }

  return true;
};

