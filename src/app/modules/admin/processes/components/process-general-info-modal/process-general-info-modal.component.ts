import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { DatePickerComponent } from '@app/shared/components/date-picker/date-picker.component';
import { ProcessService } from '@app/core/services/process/process.service';
import {
  ProcessDetail,
  UpdateProcessGeneralInfoPayload,
  UpdateProcessGeneralInfoResponse,
} from '@app/core/models/process/process.model';
import {
  isIsoDateInAllowedRange,
  normalizeIsoDate,
  textsEqual,
} from '@app/core/utils/iso-date.utils';

@Component({
  selector: 'app-process-general-info-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, DatePickerComponent],
  templateUrl: './process-general-info-modal.component.html',
  styleUrls: ['./process-general-info-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessGeneralInfoModalComponent {
  private _processService = inject(ProcessService);
  private _fb = inject(FormBuilder);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);

  public process = input.required<ProcessDetail>();

  public closed = output<void>();
  public saved = output<UpdateProcessGeneralInfoResponse>();

  public isSaving = signal(false);
  public errorMessage = signal<string | null>(null);
  public fieldErrors = signal<Record<string, string>>({});
  public hasChanges = signal(false);
  public invalidProcessDateHint = signal<string | null>(null);

  public form = this._fb.group({
    court: [''],
    speaker: [''],
    department: [''],
    process_type: [''],
    process_class: [''],
    subclass_process: [''],
    location: [''],
    process_date: [null as string | null],
  });

  constructor() {
    effect(() => {
      const current = this.process();
      this.form.reset({
        court: current.court ?? '',
        speaker: current.speaker ?? '',
        department: current.department ?? '',
        process_type: current.process_type ?? '',
        process_class: current.process_class ?? '',
        subclass_process: current.subclass_process ?? '',
        location: current.location ?? '',
        process_date: normalizeIsoDate(current.process_date_iso),
      });
      this.errorMessage.set(null);
      this.fieldErrors.set({});
      this.hasChanges.set(false);
      this._refreshInvalidDateHint();
    });

    this.form.valueChanges.pipe(takeUntilDestroyed(this._destroyRef)).subscribe(() => {
      this.hasChanges.set(this._buildPayload() !== null);
      this._clearFieldErrorOnChange();
    });
  }

  public onClose(): void {
    if (this.isSaving()) return;
    this.closed.emit();
  }

  public onSave(): void {
    if (this.isSaving()) return;

    const payload = this._buildPayload();
    if (!payload) {
      this.errorMessage.set(this._transloco.translate('processDetail.generalInfoModal.noChanges'));
      return;
    }

    const processDate = payload.process_date;
    if (processDate && !isIsoDateInAllowedRange(processDate)) {
      this.fieldErrors.set({
        ...this.fieldErrors(),
        process_date: this._transloco.translate('processDetail.generalInfoModal.dateOutOfRange'),
      });
      return;
    }

    if (payload.court !== undefined && !payload.court.trim()) {
      this.fieldErrors.set({
        ...this.fieldErrors(),
        court: this._transloco.translate('processDetail.generalInfoModal.courtRequired'),
      });
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});
    this.form.disable({ emitEvent: false });

    this._processService
      .updateProcessGeneralInfo(this.process().id, payload)
      .pipe(
        finalize(() => {
          this.isSaving.set(false);
          this.form.enable({ emitEvent: false });
        })
      )
      .subscribe({
        next: (response) => this.saved.emit(response),
        error: (err: HttpErrorResponse) => this._handleError(err),
      });
  }

  public fieldError(key: string): string | null {
    return this.fieldErrors()[key] ?? null;
  }

  private _buildPayload(): UpdateProcessGeneralInfoPayload | null {
    const current = this.process();
    const value = this.form.getRawValue();
    const payload: UpdateProcessGeneralInfoPayload = {};

    const court = (value.court ?? '').trim();
    if (!textsEqual(court, current.court)) {
      payload.court = court;
    }

    const speaker = (value.speaker ?? '').trim();
    if (!textsEqual(speaker, current.speaker)) {
      payload.speaker = speaker === '' ? null : speaker;
    }

    const department = (value.department ?? '').trim();
    if (!textsEqual(department, current.department)) {
      payload.department = department;
    }

    const processType = (value.process_type ?? '').trim();
    if (!textsEqual(processType, current.process_type)) {
      payload.process_type = processType;
    }

    const processClass = (value.process_class ?? '').trim();
    if (!textsEqual(processClass, current.process_class)) {
      payload.process_class = processClass;
    }

    const subclass = (value.subclass_process ?? '').trim();
    if (!textsEqual(subclass, current.subclass_process)) {
      payload.subclass_process = subclass === '' ? null : subclass;
    }

    const location = (value.location ?? '').trim();
    if (!textsEqual(location, current.location)) {
      payload.location = location === '' ? null : location;
    }

    const processDate = normalizeIsoDate(value.process_date);
    const originalDate = normalizeIsoDate(current.process_date_iso);
    if (processDate !== originalDate && processDate) {
      payload.process_date = processDate;
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  private _refreshInvalidDateHint(): void {
    const iso = normalizeIsoDate(this.process().process_date_iso);
    if (iso && !isIsoDateInAllowedRange(iso)) {
      this.invalidProcessDateHint.set(iso);
      return;
    }
    this.invalidProcessDateHint.set(null);
  }

  private _clearFieldErrorOnChange(): void {
    const errors = this.fieldErrors();
    if (!Object.keys(errors).length) return;
    const next = { ...errors };
    for (const key of Object.keys(this.form.controls)) {
      if (this.form.get(key)?.dirty) {
        delete next[key];
      }
    }
    this.fieldErrors.set(next);
  }

  private _handleError(err: HttpErrorResponse): void {
    const fieldErrors = this._extractFieldErrors(err);
    if (Object.keys(fieldErrors).length) {
      this.fieldErrors.set(fieldErrors);
    }

    const message =
      typeof err.error?.message === 'string' && err.error.message.trim()
        ? err.error.message
        : err.status === 404
          ? this._transloco.translate('processDetail.generalInfoModal.notFound')
          : this._transloco.translate('processDetail.generalInfoModal.errorGeneric');

    if (!Object.keys(fieldErrors).length || err.status === 404) {
      this.errorMessage.set(message);
    }
  }

  private _extractFieldErrors(err: HttpErrorResponse): Record<string, string> {
    const errors = err.error?.errors;
    if (!errors || typeof errors !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length) {
        result[key] = String(value[0]);
      } else if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }
}
