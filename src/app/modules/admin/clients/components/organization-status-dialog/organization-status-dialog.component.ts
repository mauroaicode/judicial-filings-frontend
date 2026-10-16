import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  OrganizationStatusMode,
  UpdateOrganizationActiveStatusPayload,
} from '@app/core/models/organization/organization.model';

/** Variantes del diálogo según la acción iniciada por el admin. */
export type OrganizationStatusDialogVariant =
  | 'deactivate'
  | 'deactivate-access'
  | 'activate'
  | 'resume';

@Component({
  selector: 'app-organization-status-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './organization-status-dialog.component.html',
  styleUrls: ['./organization-status-dialog.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationStatusDialogComponent {
  open = input.required<boolean>();
  organizationName = input.required<string>();
  variant = input.required<OrganizationStatusDialogVariant>();
  submitting = input(false);

  confirmed = output<UpdateOrganizationActiveStatusPayload>();
  cancelled = output<void>();

  /** Solo usado en variant=deactivate */
  selectedMode = signal<Extract<OrganizationStatusMode, 'inactive' | 'tracking_paused'>>('inactive');
  notifyUsers = signal(false);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.selectedMode.set('inactive');
        this.notifyUsers.set(false);
      }
    });
  }

  get titleKey(): string {
    switch (this.variant()) {
      case 'deactivate':
        return 'clients.statusDialog.deactivateTitle';
      case 'deactivate-access':
        return 'clients.statusDialog.deactivateAccessTitle';
      case 'activate':
        return 'clients.statusDialog.activateTitle';
      case 'resume':
        return 'clients.statusDialog.resumeTitle';
    }
  }

  get confirmLabelKey(): string {
    switch (this.variant()) {
      case 'deactivate':
        return 'clients.statusDialog.confirmDeactivate';
      case 'deactivate-access':
        return 'clients.statusDialog.confirmDeactivateAccess';
      case 'activate':
        return 'clients.statusDialog.confirmActivate';
      case 'resume':
        return 'clients.statusDialog.confirmResume';
    }
  }

  get confirmBtnClass(): string {
    switch (this.variant()) {
      case 'activate':
      case 'resume':
        return 'btn-primary';
      default:
        return 'btn-neutral';
    }
  }

  get showsNotifyCheckbox(): boolean {
    return this.variant() === 'deactivate' || this.variant() === 'deactivate-access';
  }

  onConfirm(): void {
    if (this.submitting()) return;

    switch (this.variant()) {
      case 'deactivate':
        this.confirmed.emit({
          mode: this.selectedMode(),
          notify_users: this.notifyUsers() || undefined,
        });
        break;
      case 'deactivate-access':
        this.confirmed.emit({
          mode: 'inactive',
          notify_users: this.notifyUsers() || undefined,
        });
        break;
      case 'activate':
      case 'resume':
        this.confirmed.emit({ mode: 'active' });
        break;
    }
  }

  onCancel(): void {
    if (this.submitting()) return;
    this.cancelled.emit();
  }
}
