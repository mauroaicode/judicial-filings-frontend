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
import { environment } from '@app/core/config/environment.config';
import { SecurityTipsPanelComponent } from '@app/shared/components/security-tips-panel/security-tips-panel.component';
import {TitleSystemAuth} from '@app/shared/components/title-system-auth/title-system-auth';
import { AlertComponent } from '@app/shared/components/alert/alert.component';
import { ErrorHandlerService } from '@app/core/services/error/error-handler.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe, SecurityTipsPanelComponent, TitleSystemAuth, AlertComponent],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements OnInit {
  private _router = inject(Router);
  private _formBuilder = inject(FormBuilder);
  private _errorHandler = inject(ErrorHandlerService);

  public forgotPasswordForm!: FormGroup;
  public isLoading = signal<boolean>(false);
  public showAlert = signal<boolean>(false);
  public alertMessage = signal<string>('');
  public alertType = signal<'success' | 'error'>('error');
  public wasCodeSent = signal<boolean>(false);
  public systemName = environment.systemName;
  private _isDirectMessage = signal<boolean>(false);

  ngOnInit(): void {
    this.forgotPasswordForm = this._formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  /**
   * Submit forgot password form
   */
  async submitForgotPassword(): Promise<void> {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    if (!this.wasCodeSent()) {
      await this.sendCode();
      return;
    }

    await this.resetPassword();
  }

  /**
   * Send recovery code to email
   */
  async sendCode(): Promise<void> {
    this.showAlert.set(false);
    this.isLoading.set(true);

    try {
      const { email } = this.forgotPasswordForm.value;

      // TODO: Implementar llamada al servicio
      // await firstValueFrom(this._authService.sendCodeRecoveryPassword(email));

      // Simulación temporal
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Disable email field and add code and password fields
      this.forgotPasswordForm.get('email')?.disable();
      this.forgotPasswordForm.addControl(
        'code',
        this._formBuilder.control('', [Validators.required])
      );
      this.forgotPasswordForm.addControl(
        'password',
        this._formBuilder.control('', [Validators.required, Validators.minLength(8)])
      );
      this.forgotPasswordForm.addControl(
        'confirmPassword',
        this._formBuilder.control('', [Validators.required])
      );

      this.forgotPasswordForm.markAsUntouched();
      this.wasCodeSent.set(true);

      this.alertType.set('success');
      this.alertMessage.set('auth.forgotPassword.codeSent');
      this._isDirectMessage.set(false);
      this.showAlert.set(true);
    } catch (error: any) {
      this.alertType.set('error');

      const errorMessage = this._errorHandler.getErrorMessage(error, true);

      if (errorMessage) {
        this.alertMessage.set(errorMessage);
        this._isDirectMessage.set(true);
        this.showAlert.set(true);
        return;
      }

      this.alertMessage.set('auth.errors.somethingWentWrong');
      this._isDirectMessage.set(false);
      this.showAlert.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Reset password with code
   */
  async resetPassword(): Promise<void> {
    this.showAlert.set(false);
    this.isLoading.set(true);

    try {
      const { email, code, password, confirmPassword } = this.forgotPasswordForm.value;

      if (password !== confirmPassword) {
        this.alertType.set('error');
        this.alertMessage.set('auth.forgotPassword.passwordsNotMatch');
        this.showAlert.set(true);
        this.isLoading.set(false);
        return;
      }

      // TODO: Implementar llamada al servicio
      // await firstValueFrom(
      //   this._authService.resetPassword(email, code, password)
      // );

      // Simulación temporal
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.alertType.set('success');
      this.alertMessage.set('auth.forgotPassword.passwordReset');
      this._isDirectMessage.set(false);
      this.showAlert.set(true);

      // Redirect to sign-in after 2 seconds
      setTimeout(() => {
        this._router.navigate(['/sign-in']);
      }, 2000);
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

      if (error?.status >= 500) {
        this.alertMessage.set('auth.errors.somethingWentWrong');
        this.showAlert.set(true);
        return;
      }

      this.alertMessage.set('auth.forgotPassword.invalidCode');
      this.showAlert.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Check if a form field is invalid
   */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.forgotPasswordForm.get(fieldName);
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
    const field = this.forgotPasswordForm.get(fieldName);
    if (field?.hasError('required')) {
      return 'auth.errors.fieldRequired';
    }
    if (field?.hasError('email')) {
      return 'auth.errors.emailInvalid';
    }
    if (field?.hasError('minlength')) {
      return 'auth.errors.passwordMinLength';
    }
    return '';
  }
}

