import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
  ViewChild,
  ViewEncapsulation,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Router,
  RouterOutlet,
  NavigationEnd,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { filter, tap } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { SidebarComponent } from '@app/layout/common/sidebar/sidebar.component';
import { HeaderComponent } from '@app/layout/common/header/header.component';
import { NotificationsComponent } from '@app/layout/common/notifications/notifications.component';

@Component({
  selector: 'app-authenticated-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent, NotificationsComponent],
  templateUrl: './authenticated.component.html',
  styleUrls: ['./authenticated.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthenticatedLayoutComponent {
  private _router = inject(Router);
  private _cdr = inject(ChangeDetectorRef);

  @ViewChild(SidebarComponent) sidebar!: SidebarComponent;

  /**
   * URL en señal: al cambiar, el título (computed) y el layout reaccionan.
   * En zoneless, además forzamos CD al terminar la navegación (mismo criterio que judicial-filings-frontend).
   */
  private _currentUrl = signal<string>(this._router.url);

  public pageTitle = computed(() => {
    this._currentUrl();
    const fromData = this._titleFromSnapshot(this._router.routerState.snapshot.root);
    if (fromData) {
      return fromData;
    }
    const path = this._router.url.split('?')[0];
    if (path.includes('/admin/processes')) {
      return 'processes.title';
    }
    if (path.includes('/admin/organizations')) {
      return 'clients.title';
    }
    if (path.includes('/admin/dashboard')) {
      return 'navigation.dashboard';
    }
    if (path.includes('/admin/import-history')) {
      return 'historialImportaciones.title';
    }
    return '';
  });

  // Sidebar state
  public sidebarOpen = signal<boolean>(true);

  constructor() {
    this._router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        tap((event) => {
          this._currentUrl.set(event.urlAfterRedirects || event.url);
          this._cdr.detectChanges();
        })
      )
      .subscribe();
  }

  private _titleFromSnapshot(root: ActivatedRouteSnapshot): string | undefined {
    let deepest = root;
    while (deepest.firstChild) {
      deepest = deepest.firstChild;
    }
    let s: ActivatedRouteSnapshot | null = deepest;
    while (s) {
      const t = s.data['title'];
      if (typeof t === 'string' && t.length > 0) {
        return t;
      }
      s = s.parent;
    }
    return undefined;
  }

  /**
   * Toggle sidebar
   */
  onToggleSidebar(): void {
    if (this.sidebar) {
      this.sidebar.toggleSidebar();
      this.sidebarOpen.set(this.sidebar.isOpen());
    }
  }
}

