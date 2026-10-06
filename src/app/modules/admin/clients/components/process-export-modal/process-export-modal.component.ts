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
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { DateRangePickerComponent, DateRange } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { ProcessExportService } from '@app/core/services/process/process-export.service';
import { ProcessExportFilters, ProcessExportItem } from '@app/core/models/process/process-export.model';

@Component({
  selector: 'app-process-export-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, DateRangePickerComponent],
  templateUrl: './process-export-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessExportModalComponent implements OnInit {
  private _fb = inject(FormBuilder);
  private _exportService = inject(ProcessExportService);
  private _transloco = inject(TranslocoService);

  public organizationId = input.required<string>();
  public organizationName = input<string>('');

  public closed = output<void>();
  public queued = output<{ item: ProcessExportItem; message: string }>();

  public submitting = signal(false);
  public submitError = signal<string | null>(null);
  public includeActions = signal(false);
  public actionsRangeEmpty = signal(true);

  /** Aviso si incluyen actuaciones sin rango de fechas */
  public showActionsNoRangeWarning = computed(() => this.includeActions() && this.actionsRangeEmpty());

  public form: FormGroup = this._fb.group({
    status: [''],
    created_at_range: [null as DateRange | null],
    updated_at_range: [null as DateRange | null],
    include_plaintiffs: [true],
    include_defendants: [true],
    include_other_subjects: [true],
    include_actions: [false],
    actions_range: [null as DateRange | null],
  });

  ngOnInit(): void {
    this.form.get('include_actions')?.valueChanges.subscribe((checked: boolean) => {
      this.includeActions.set(!!checked);
      if (checked) {
        const current = this.form.get('actions_range')?.value as DateRange | null;
        if (!current?.from && !current?.to) {
          this.form.patchValue({ actions_range: this._defaultActionsRange() }, { emitEvent: true });
        }
      }
    });

    this.form.get('actions_range')?.valueChanges.subscribe((range: DateRange | null) => {
      this.actionsRangeEmpty.set(!range?.from?.trim() && !range?.to?.trim());
    });
  }

  onClose(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  onSubmit(): void {
    if (this.submitting()) return;

    this.submitError.set(null);
    this.submitting.set(true);

    const payload = this._buildPayload();
    this._exportService
      .enqueue(this.organizationId(), payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (response) => {
          const message = this._transloco.translate('historialExportaciones.toast.queued');
          this.queued.emit({ item: response.data, message });
        },
        error: (err) => {
          this.submitError.set(this._parseApiError(err));
        },
      });
  }

  private _buildPayload(): ProcessExportFilters {
    const raw = this.form.getRawValue();
    const status = (raw.status as string)?.trim();
    const created = raw.created_at_range as DateRange | null;
    const updated = raw.updated_at_range as DateRange | null;
    const actions = raw.actions_range as DateRange | null;
    const includeActions = !!raw.include_actions;

    const payload: ProcessExportFilters = {
      include_plaintiffs: !!raw.include_plaintiffs,
      include_defendants: !!raw.include_defendants,
      include_other_subjects: !!raw.include_other_subjects,
      include_actions: includeActions,
    };

    if (status === 'active' || status === 'inactive' || status === 'suspended') {
      payload.status = status;
    }

    if (created?.from?.trim()) payload.created_at_from = created.from.trim();
    if (created?.to?.trim()) payload.created_at_to = created.to.trim();
    if (updated?.from?.trim()) payload.updated_at_from = updated.from.trim();
    if (updated?.to?.trim()) payload.updated_at_to = updated.to.trim();

    if (includeActions) {
      if (actions?.from?.trim()) payload.actions_from = actions.from.trim();
      if (actions?.to?.trim()) payload.actions_to = actions.to.trim();
    } else {
      payload.actions_from = null;
      payload.actions_to = null;
    }

    return payload;
  }

  /** Últimos 90 días (Y-m-d) */
  private _defaultActionsRange(): DateRange {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    return {
      from: this._toYmd(from),
      to: this._toYmd(to),
    };
  }

  private _toYmd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private _parseApiError(err: { status?: number; error?: unknown }): string {
    const body = err?.error;
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
      const errors = (body as { errors?: Record<string, string[]> }).errors;
      if (errors && typeof errors === 'object') {
        for (const key of Object.keys(errors)) {
          const arr = errors[key];
          if (Array.isArray(arr) && typeof arr[0] === 'string' && arr[0].trim()) {
            return arr[0].trim();
          }
        }
      }
    }
    return this._transloco.translate('historialExportaciones.errors.enqueue');
  }
}
