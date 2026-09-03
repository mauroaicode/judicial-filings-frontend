import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '@app/shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-trash-processes-modal',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, SearchableSelectComponent],
  templateUrl: './trash-processes-modal.component.html',
  styleUrls: ['./trash-processes-modal.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashProcessesModalComponent {
  open = input.required<boolean>();
  processCount = input.required<number>();
  organizationOptions = input<SearchableSelectOption[]>([]);
  organizationsLoading = input(false);
  initialOrganizationId = input('');
  submitting = input(false);
  /** Org ya determinada (detalle con 1 org o query param). Oculta el select. */
  lockOrganization = input(false);
  lockedOrganizationName = input('');

  confirm = output<{ organizationId: string }>();
  cancel = output<void>();

  selectedOrganizationId = signal('');

  lockedOrganizationLabel = computed(() => this.lockedOrganizationName().trim());

  canConfirm = computed(() => {
    if (this.submitting()) return false;
    if (this.processCount() < 1) return false;
    const orgId = this.lockOrganization()
      ? this.initialOrganizationId().trim()
      : this.selectedOrganizationId().trim();
    return !!orgId;
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      this.selectedOrganizationId.set(this.initialOrganizationId().trim());
    });
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    const organizationId = this.lockOrganization()
      ? this.initialOrganizationId().trim()
      : this.selectedOrganizationId().trim();
    if (!organizationId) return;
    this.confirm.emit({ organizationId });
  }

  onCancel(): void {
    if (this.submitting()) return;
    this.cancel.emit();
  }
}
