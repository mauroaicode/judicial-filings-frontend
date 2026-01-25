import {inject} from '@angular/core';
import {Router, type CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot} from '@angular/router';
import {AuthService} from '@app/core/auth/auth.service';
import {User} from '@app/core/models/auth/auth.model';

/**
 * Auth Guard
 * Protects routes that require authentication
 */
export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> => {
  const authService = inject(AuthService);
  const router: Router = inject(Router);

  const token: string | null = authService.accessToken;
  const user: User | null = authService.currentUser;

  if (!token || !user) {
    await router.navigate(['/sign-in']);
    return false;
  }

  return true;
};

