import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { NavigationItem, Navigation } from '@app/core/models/navigation/navigation-item.model';
import { AuthService } from '@app/core/auth/auth.service';
import { DEFAULT_NAVIGATION } from './navigation.data';

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  private _authService = inject(AuthService);

  // Navigation data signal
  private _navigation = signal<Navigation>({
    default: DEFAULT_NAVIGATION,
  });

  // Public readonly navigation
  public readonly navigation = this._navigation.asReadonly();

  // Computed navigation filtered by roles
  public readonly filteredNavigation = computed(() => {
    const navigation = this._navigation();
    const user = this._authService.currentUser;

    if (!user) {
      return { default: [] };
    }

    const filtered = navigation.default.filter((item) => {
      return this._canAccessItem(item, user.roles || []);
    });

    return { default: filtered };
  });

  constructor() {
    effect(() => {
      const user = this._authService.currentUser;
      if (user) {

        this._navigation.set({
          default: DEFAULT_NAVIGATION,
        });
      }
    });
  }

  /**
   * Check if user can access a navigation item
   */
  private _canAccessItem(item: NavigationItem, userRoles: Array<{ value: string; label: string }>): boolean {
    if (!item.meta || !item.meta.roles || item.meta.roles.length === 0) {
      return true;
    }

    const userRoleValues = userRoles.map((role) => role.value);
    return item.meta.roles.some((requiredRole) => userRoleValues.includes(requiredRole));
  }

  /**
   * Update navigation items
   */
  updateNavigation(items: NavigationItem[]): void {
    this._navigation.set({ default: items });
  }
}

