import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '@app/core/auth/auth.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { NotificationBellComponent } from './notification-bell/notification-bell.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, NotificationBellComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private _authService = inject(AuthService);
  private _router = inject(Router);
  private _translocoService = inject(TranslocoService);

  // Inputs
  public pageTitle = input<string>('');
  public sidebar = input<SidebarComponent | null>(null);

  // Outputs
  public toggleSidebar = output<void>();

  // User data
  public currentUser = this._authService.user;

  // Translated page title
  public translatedTitle = computed(() => {
    const title = this.pageTitle();
    if (!title) return '';
    return this._translocoService.translate(title);
  });

  /**
   * Toggle sidebar
   */
  onToggleSidebar(): void {
    this.toggleSidebar.emit();
    if (this.sidebar()) {
      this.sidebar()?.toggleSidebar();
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    try {
      await this._authService.signOut();
      await this._router.navigate(['/sign-in']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
}

