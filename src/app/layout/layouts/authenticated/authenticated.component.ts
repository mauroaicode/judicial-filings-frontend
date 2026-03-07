import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
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
  private _activatedRoute = inject(ActivatedRoute);

  @ViewChild(SidebarComponent) sidebar!: SidebarComponent;

  // Current page title
  public pageTitle = signal<string>('');

  // Sidebar state
  public sidebarOpen = signal<boolean>(true);

  constructor() {
    // Update page title on route change
    this._router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this._updatePageTitle();
      });

    // Initial title update
    effect(() => {
      this._updatePageTitle();
    });
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

  /**
   * Update page title from route data
   */
  private _updatePageTitle(): void {
    let route = this._activatedRoute;
    while (route.firstChild) {
      route = route.firstChild;
    }

    const title = route.snapshot.data['title'];
    if (title) {
      this.pageTitle.set(title);
    } else {
      // Default title based on route
      const path = this._router.url;
      if (path.includes('/dashboard')) {
        this.pageTitle.set('navigation.dashboard');
      } else if (path.includes('/processes')) {
        this.pageTitle.set('processes.title');
      } else if (path.includes('/organizations')) {
        this.pageTitle.set('clients.title');
      } else {
        this.pageTitle.set('');
      }
    }
  }
}

