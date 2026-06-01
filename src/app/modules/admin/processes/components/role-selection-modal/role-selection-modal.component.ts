import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { ProcessService } from '@app/core/services/process/process.service';

@Component({
  selector: 'app-role-selection-modal',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ReactiveFormsModule],
  templateUrl: './role-selection-modal.component.html',
  styleUrls: ['./role-selection-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleSelectionModalComponent implements OnInit {
  private _processService = inject(ProcessService);
  private _fb = inject(FormBuilder);

  /** ID del proceso (para modo individual u organización) */
  public processId = input<string>();

  /** ID de la organización (asignación por organización en admin) */
  public organizationId = input<string>();

  /** Nombre de la organización (solo UI) */
  public organizationName = input<string>();

  /** Array de IDs de procesos (para modo masivo) */
  public bulkProcessIds = input<string[]>([]);

  /** Indica si estamos en modo masivo */
  public isBulk = computed(() => (this.bulkProcessIds()?.length ?? 0) > 0);

  /** Asignación de rol por organización */
  public isOrganizationMode = computed(() => !!this.organizationId());

  /** Numero de procesos seleccionados en modo masivo */
  public selectedCount = computed(() => this.bulkProcessIds()?.length ?? 0);

  /** Rol actual (opcional, solo modo individual) */
  public currentRole = input<string | null>();

  /** Evento al cerrar la modal */
  public closed = output<void>();

  /** Evento al guardar exitosamente (retorna el rol asignado o el payload de respuesta masiva) */
  public saved = output<any>();

  // State
  public roles = signal<{ value: string; label: string }[]>([]);
  public isLoading = signal(false);
  public isSaving = signal(false);
  public roleForm: FormGroup;

  constructor() {
    this.roleForm = this._fb.group({
      role: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this._loadRoles();
    const current = this.currentRole();
    if (current) {
      const mappedValue = this._mapCurrentRoleValue(current);
      if (mappedValue) {
        this.roleForm.patchValue({ role: mappedValue });
      }
    }
  }

  private _mapCurrentRoleValue(role: string): string {
    const normalized = role.trim().toLowerCase();
    if (normalized === 'plaintiff' || normalized.includes('demandante')) return 'plaintiff';
    if (normalized === 'defendant' || normalized.includes('demandado')) return 'defendant';
    return '';
  }

  private _loadRoles(): void {
    this.isLoading.set(true);
    this._processService
      .getProcessRoles()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (roles) => this.roles.set(roles),
        error: () => {
          this.roles.set([
            { value: 'plaintiff', label: 'Demandante' },
            { value: 'defendant', label: 'Demandado' },
          ]);
        },
      });
  }

  public onSave(): void {
    if (this.roleForm.invalid) return;
    this.onConfirmSave();
  }

  public onConfirmSave(): void {
    this._executeSave();
  }

  private _executeSave(): void {
    this.isSaving.set(true);
    const selectedRole = this.roleForm.value.role;

    const request$ = this.isOrganizationMode()
      ? this._processService.updateOrganizationProcessRole(
          this.processId()!,
          this.organizationId()!,
          selectedRole
        )
      : this.isBulk()
        ? this._processService.updateBulkProcessRoles(this.bulkProcessIds()!, selectedRole)
        : this._processService.updateProcessRole(this.processId()!, selectedRole);

    request$.pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: (response) => {
        this.saved.emit(response);
      },
      error: (err) => {
        console.error('Error updating role:', err);
      },
    });
  }

  public onClose(): void {
    this.closed.emit();
  }
}

