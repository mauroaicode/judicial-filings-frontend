import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { SecurityTipsPanelComponent } from '@app/shared/components/security-tips-panel/security-tips-panel.component';
import {TitleSystemAuth} from '@app/shared/components/title-system-auth/title-system-auth';
import { AlertComponent } from '@app/shared/components/alert/alert.component';
import { AuthService } from '@app/core/auth/auth.service';
import { ROLE_ROUTE_MAP, ROUTES_ADMIN } from '@app/core/constants/router.constant';
import type { RoleName } from '@app/core/constants/router.constant';
import { ErrorHandlerService } from '@app/core/services/error/error-handler.service';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe, SecurityTipsPanelComponent, TitleSystemAuth, AlertComponent],
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent implements OnInit {
  private _router = inject(Router);
  private _formBuilder = inject(FormBuilder);
  private _authService = inject(AuthService);
  private _errorHandler = inject(ErrorHandlerService);

  public signInForm!: FormGroup;
  public isLoading = signal<boolean>(false);
  public showPassword = signal<boolean>(false);
  public showAlert = signal<boolean>(false);
  public alertMessage = signal<string>('');
  public alertType = signal<'success' | 'error'>('error');
  private _isDirectMessage = signal<boolean>(false);

  ngOnInit(): void {
    this.signInForm = this._formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      rememberMe: [false],
    });
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  /**
   * Sign in
   */
  async signIn(): Promise<void> {

    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.showAlert.set(false);

    try {

      const { email, password } = this.signInForm.value;

      const response = await firstValueFrom(
        this._authService.signIn({ email, password })
      );

      // Save token and user
      this._authService.accessToken = response.token;
      this._authService.currentUser = response.user;

      this.alertType.set('success');
      this.alertMessage.set('auth.success.login');
      this._isDirectMessage.set(false)
      this.showAlert.set(true);

      await this.redirectToAdmin(response.user);

    } catch (error: any) {

      this.alertType.set('error');

      const errorMessage = this._errorHandler.getErrorMessage(error, true);

      if (errorMessage) {
        this.alertMessage.set(errorMessage);
        this._isDirectMessage.set(true);
        this.showAlert.set(true);
        return;
      }

      this._isDirectMessage.set(false);

      if (error?.status === 401 || error?.status === 422) {
        this.alertMessage.set('auth.errors.emailOrPasswordIncorrect');
        this.showAlert.set(true);
        return;
      }

      if (error?.status >= 500) {
        this.alertMessage.set('auth.errors.serverError');
        this.showAlert.set(true);
        return;
      }

      this.alertMessage.set('auth.errors.somethingWentWrong');
      this.showAlert.set(true);

    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Check if a form field is invalid
   */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.signInForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /**
   * Check if current alert message is a direct message (not a translation key)
   */
  public isDirectMessage(): boolean {
    return this._isDirectMessage();
  }

  /**
   * Get error message for a field
   */
  getFieldError(fieldName: string): string {
    const field = this.signInForm.get(fieldName);
    if (field?.hasError('required')) {
      return fieldName === 'email'
        ? 'auth.errors.emailRequired'
        : 'auth.errors.passwordRequired';
    }
    if (field?.hasError('email')) {
      return 'auth.errors.emailInvalid';
    }
    return '';
  }

  /**
   * Redirects the user to the appropriate route based on their roles.
   *
   * This method iterates through the roles of the provided user and navigates
   * to the first matching route found in the `ROLE_ROUTE_MAP`. If no matching route
   * is found, it defaults to navigating to the dashboard route.
   *
   * @param user - The user object containing roles to determine the redirection route.
   *
   * @returns A promise that resolves once the navigation is complete.
   */
  async redirectToAdmin(user: any): Promise<void> {
    const userRoles = user?.roles ?? [];

    for (const role of userRoles) {

      const roleName = role.value as RoleName;
      const route = ROLE_ROUTE_MAP[roleName];

      if (route) {

        setTimeout(() => {
          this._router.navigate([route]);
        }, 1000);

        return;
      }
    }

    setTimeout(() => {
      this._router.navigate([ROUTES_ADMIN.PROCESSES]);
    }, 1000);
  }
}

