import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NavigationService } from '@app/core/navigation/navigation.service';
import { NavigationItem } from '@app/core/models/navigation/navigation-item.model';
import { SidebarIconComponent } from './sidebar-icon.component';
import { STORAGE } from '@app/core/constants/storage.constant';
import { environment } from '@app/core/config/environment.config';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, SidebarIconComponent],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private _navigationService = inject(NavigationService);
  private _router = inject(Router);
  private _transloco = inject(TranslocoService);
  private _document = inject(DOCUMENT);
  private _destroyRef = inject(DestroyRef);
  private _bodyTooltipEl: HTMLElement | null = null;

  // Sidebar state - load from localStorage or default to true
  public isOpen = signal<boolean>(this._loadSidebarState());
  public isMobile = signal<boolean>(false);

  /** Tooltip flotante al pasar por ítems con el menú colapsado (desktop) */
  public collapsedNavTooltip = signal<{ label: string; top: number; left: number } | null>(null);

  /** Muestra tooltips solo en escritorio con el menú cerrado */
  public showCollapsedTooltips = computed(() => !this.isOpen() && !this.isMobile());

  // Navigation items
  public navigation = computed(() => this._navigationService.filteredNavigation());

  // Menu title from environment
  public menuTitle = environment.menuTitle;

  // Track expanded items for collapsable menus
  private _expandedItems = signal<Set<string>>(new Set());

  /** Sincronizado con Router (zoneless): evita que routerLinkActive quede desactualizado */
  public currentUrl = signal<string>(this._router.url);

  /** Ítem de menú activo según la URL (mismo patrón que judicial-filings-frontend) */
  public selectedMenuId = signal<string | null>(null);

  constructor() {
    this._syncSelectedMenuFromUrl(this._router.url);

    this._router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const nextUrl = event.urlAfterRedirects || event.url || this._router.url;
        this.currentUrl.set(nextUrl);
        this._syncSelectedMenuFromUrl(nextUrl);
      });

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

    // Renderizar tooltip en body para que no quede detrás del contenido principal
    effect(() => {
      this._syncBodyTooltip(this.collapsedNavTooltip());
    });

    this._destroyRef.onDestroy(() => this._removeBodyTooltip());
  }

  /**
   * Toggle sidebar open/close
   */
  toggleSidebar(): void {
    this.isOpen.update((value) => !value);
    this.hideNavTooltip();
  }

  /**
   * Muestra el tooltip flotante junto al ítem del menú colapsado
   */
  onNavItemHover(event: Event, titleKey: string): void {
    if (!this.showCollapsedTooltips() || !titleKey) return;

    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    this.collapsedNavTooltip.set({
      label: this._transloco.translate(titleKey),
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  }

  /**
   * Oculta el tooltip flotante del menú colapsado
   */
  hideNavTooltip(): void {
    this.collapsedNavTooltip.set(null);
  }

  private _syncBodyTooltip(tip: { label: string; top: number; left: number } | null): void {
    this._removeBodyTooltip();
    if (!tip) return;

    const el = this._document.createElement('div');
    el.className = 'sidebar-floating-tooltip';
    el.setAttribute('role', 'tooltip');
    el.textContent = tip.label;
    el.style.top = `${tip.top}px`;
    el.style.left = `${tip.left}px`;
    this._document.body.appendChild(el);
    this._bodyTooltipEl = el;
  }

  private _removeBodyTooltip(): void {
    this._bodyTooltipEl?.remove();
    this._bodyTooltipEl = null;
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
   * Check if item is active (collapsable padre si algún hijo coincide con la URL)
   */
  isItemActive(item: NavigationItem): boolean {
    this.currentUrl();
    if (!item.link && (!item.children || item.children.length === 0)) return false;
    if (item.link && this._router.isActive(item.link, {
      paths: 'subset',
      queryParams: 'subset',
      fragment: 'ignored',
      matrixParams: 'ignored',
    })) {
      return true;
    }
    if (item.children) {
      return item.children.some((child) => this.isItemActive(child));
    }
    return false;
  }

  /** Resalta el enlace comparando la URL normalizada (evita retraso en modo zoneless) */
  isLinkActive(link?: string): boolean {
    if (!link) return false;
    const current = this._normalizePath(this.currentUrl());
    const target = this._normalizePath(link);
    return this._matchesPath(current, target);
  }

  isItemSelected(itemId: string): boolean {
    return this.selectedMenuId() === itemId;
  }

  /**
   * Click en ítem básico: marca selección y cierra en móvil (la navegación la hace routerLink)
   */
  onNavItemClick(item: NavigationItem): void {
    this.hideNavTooltip();
    if (item.disabled || !item.link) return;
    if (item.type === 'collapsable' && item.children) {
      this.toggleItem(item);
      return;
    }
    this.selectedMenuId.set(item.id);
    if (this.isMobile()) {
      this.closeSidebar();
    }
  }

  private _normalizePath(url: string): string {
    return (url || '').split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  }

  private _matchesPath(current: string, target: string): boolean {
    return current === target || current.startsWith(`${target}/`);
  }

  private _syncSelectedMenuFromUrl(url: string): void {
    const normalized = this._normalizePath(url);
    const navItems = this.navigation().default;

    for (const item of navItems) {
      if (item.type === 'divider' || item.type === 'group') {
        continue;
      }
      if (item.link && this._matchesPath(normalized, this._normalizePath(item.link))) {
        this.selectedMenuId.set(item.id);
        return;
      }
      if (item.children?.length) {
        for (const child of item.children) {
          if (child.link && this._matchesPath(normalized, this._normalizePath(child.link))) {
            this.selectedMenuId.set(child.id);
            return;
          }
        }
      }
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

