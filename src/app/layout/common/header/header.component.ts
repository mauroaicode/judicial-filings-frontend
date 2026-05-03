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
   * Solicita alternar el sidebar: solo emite; el layout padre ejecuta el toggle una vez.
   * (Evitar llamar toggle aquí y en el padre: dos toggles por clic dejaban el menú igual.)
   */
  onToggleSidebar(): void {
    this.toggleSidebar.emit();
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

