import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NavigationService } from '@app/core/navigation/navigation.service';
import { NavigationItem } from '@app/core/models/navigation/navigation-item.model';
import { STORAGE } from '@app/core/constants/storage.constant';
import { environment } from '@app/core/config/environment.config';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private _navigationService = inject(NavigationService);
  private _router = inject(Router);
  private _activatedRoute = inject(ActivatedRoute);

  // Sidebar state - load from localStorage or default to true
  public isOpen = signal<boolean>(this._loadSidebarState());
  public isMobile = signal<boolean>(false);

  // Navigation items
  public navigation = computed(() => this._navigationService.filteredNavigation());

  // Menu title from environment
  public menuTitle = environment.menuTitle;

  // Track expanded items for collapsable menus
  private _expandedItems = signal<Set<string>>(new Set());

  constructor() {
    // Check if mobile on init and resize
    this._checkMobile();
    window.addEventListener('resize', () => {
      const wasMobile = this.isMobile();
      this._checkMobile();
      // If switching from mobile to desktop, restore saved state
      if (wasMobile && !this.isMobile()) {
        const savedState = this._loadSidebarState();
        this.isOpen.set(savedState);
      }
      // If switching to mobile, close sidebar (but don't save)
      if (!wasMobile && this.isMobile()) {
        this.isOpen.set(false);
      }
    });

    // Initialize sidebar state based on screen size
    if (this.isMobile()) {
      // On mobile, always start closed
      this.isOpen.set(false);
    } else {
      // On desktop, load saved state
      const savedState = this._loadSidebarState();
      this.isOpen.set(savedState);
    }

    // Save sidebar state whenever it changes (only on desktop)
    effect(() => {
      const isOpenValue = this.isOpen();
      if (!this.isMobile()) {
        this._saveSidebarState(isOpenValue);
      }
    });
  }

  /**
   * Toggle sidebar open/close
   */
  toggleSidebar(): void {
    this.isOpen.update((value) => !value);
  }

  /**
   * Close sidebar (useful for mobile)
   */
  closeSidebar(): void {
    this.isOpen.set(false);
  }

  /**
   * Check if item is expanded
   */
  isItemExpanded(itemId: string): boolean {
    return this._expandedItems().has(itemId);
  }

  /**
   * Toggle item expansion
   */
  toggleItem(item: NavigationItem): void {
    if (item.type === 'collapsable' && item.children) {
      const expanded = this._expandedItems();
      if (expanded.has(item.id)) {
        expanded.delete(item.id);
      } else {
        expanded.add(item.id);
      }
      this._expandedItems.set(new Set(expanded));
    }
  }

  /**
   * Check if item is active (para ítems collapsable; los básicos usan routerLinkActive)
   */
  isItemActive(item: NavigationItem): boolean {
    if (!item.link) return false;
    return this._router.isActive(item.link, {
      paths: 'subset',
      queryParams: 'subset',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }

  /**
   * Al hacer click en un ítem: en móvil cerrar sidebar; la navegación la hace el routerLink del <a>
   */
  onNavItemClick(item: NavigationItem): void {
    if (item.disabled || !item.link) return;
    if (item.type === 'collapsable' && item.children) {
      this.toggleItem(item);
      return;
    }
    if (this.isMobile()) {
      this.closeSidebar();
    }
  }

  /**
   * Check if screen is mobile
   */
  private _checkMobile(): void {
    this.isMobile.set(window.innerWidth < 768);
  }

  /**
   * Load sidebar state from localStorage
   */
  private _loadSidebarState(): boolean {
    try {
      const saved = localStorage.getItem(STORAGE.SIDEBAR_OPEN);
      if (saved !== null) {
        return saved === 'true';
      }
      // Default to open if no saved state
      return true;
    } catch (error) {
      console.error('Error loading sidebar state:', error);
      return true;
    }
  }

  /**
   * Save sidebar state to localStorage
   */
  private _saveSidebarState(isOpen: boolean): void {
    try {
      localStorage.setItem(STORAGE.SIDEBAR_OPEN, String(isOpen));
    } catch (error) {
      console.error('Error saving sidebar state:', error);
    }
  }
}

