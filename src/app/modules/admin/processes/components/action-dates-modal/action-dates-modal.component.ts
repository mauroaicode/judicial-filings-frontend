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
  Action,
  UpdateProcessActionDatesPayload,
  UpdateProcessActionResponse,
} from '@app/core/models/process/process.model';
import { isIsoDateInAllowedRange, normalizeIsoDate } from '@app/core/utils/iso-date.utils';

@Component({
  selector: 'app-action-dates-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, DatePickerComponent],
  templateUrl: './action-dates-modal.component.html',
  styleUrls: ['./action-dates-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionDatesModalComponent {
  private _processService = inject(ProcessService);
  private _fb = inject(FormBuilder);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);

  public processId = input.required<string>();
  public action = input.required<Action>();

  public closed = output<void>();
  public saved = output<UpdateProcessActionResponse>();

  public isSaving = signal(false);
  public errorMessage = signal<string | null>(null);
  public fieldErrors = signal<Record<string, string>>({});
  public hasChanges = signal(false);
  public invalidDateHints = signal<Record<string, string>>({});

  public form = this._fb.group({
    action_date: [null as string | null],
    registration_date: [null as string | null],
    term_start_date: [null as string | null],
    term_end_date: [null as string | null],
  });

  constructor() {
    effect(() => {
      const current = this.action();
      this.form.reset({
        action_date: normalizeIsoDate(current.action_date_iso),
        registration_date: normalizeIsoDate(current.registration_date_iso),
        term_start_date: normalizeIsoDate(current.term_start_date_iso),
        term_end_date: normalizeIsoDate(current.term_end_date_iso),
      });
      this.errorMessage.set(null);
      this.fieldErrors.set({});
      this.hasChanges.set(false);
      this._refreshInvalidDateHints();
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
      this.errorMessage.set(this._transloco.translate('processDetail.actions.datesModal.noChanges'));
      return;
    }

    const rangeError = this._termRangeError();
    if (rangeError) {
      this.fieldErrors.set({ ...this.fieldErrors(), term_end_date: rangeError });
      return;
    }

    const outOfRange = this._outOfRangeFieldErrors(payload);
    if (Object.keys(outOfRange).length) {
      this.fieldErrors.set({ ...this.fieldErrors(), ...outOfRange });
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});
    this.form.disable({ emitEvent: false });

    this._processService
      .updateProcessActionDates(this.processId(), this.action().id, payload)
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

  public invalidHint(key: string): string | null {
    return this.invalidDateHints()[key] ?? null;
  }

  private _buildPayload(): UpdateProcessActionDatesPayload | null {
    const current = this.action();
    const value = this.form.getRawValue();
    const payload: UpdateProcessActionDatesPayload = {};

    const actionDate = normalizeIsoDate(value.action_date);
    if (actionDate !== normalizeIsoDate(current.action_date_iso) && actionDate) {
      payload.action_date = actionDate;
    }

    const registrationDate = normalizeIsoDate(value.registration_date);
    if (registrationDate !== normalizeIsoDate(current.registration_date_iso) && registrationDate) {
      payload.registration_date = registrationDate;
    }

    const termStart = normalizeIsoDate(value.term_start_date);
    if (termStart !== normalizeIsoDate(current.term_start_date_iso)) {
      payload.term_start_date = termStart;
    }

    const termEnd = normalizeIsoDate(value.term_end_date);
    if (termEnd !== normalizeIsoDate(current.term_end_date_iso)) {
      payload.term_end_date = termEnd;
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  private _termRangeError(): string | null {
    const start = normalizeIsoDate(this.form.getRawValue().term_start_date);
    const end = normalizeIsoDate(this.form.getRawValue().term_end_date);
    if (start && end && end < start) {
      return this._transloco.translate('processDetail.actions.datesModal.termRangeError');
    }
    return null;
  }

  private _outOfRangeFieldErrors(payload: UpdateProcessActionDatesPayload): Record<string, string> {
    const result: Record<string, string> = {};
    const message = this._transloco.translate('processDetail.actions.datesModal.dateOutOfRange');
    (['action_date', 'registration_date', 'term_start_date', 'term_end_date'] as const).forEach((key) => {
      const value = payload[key];
      if (typeof value === 'string' && !isIsoDateInAllowedRange(value)) {
        result[key] = message;
      }
    });
    return result;
  }

  private _refreshInvalidDateHints(): void {
    const current = this.action();
    const hints: Record<string, string> = {};
    const pairs: Array<[string, string | null | undefined]> = [
      ['action_date', current.action_date_iso],
      ['registration_date', current.registration_date_iso],
      ['term_start_date', current.term_start_date_iso],
      ['term_end_date', current.term_end_date_iso],
    ];
    for (const [key, raw] of pairs) {
      const iso = normalizeIsoDate(raw);
      if (iso && !isIsoDateInAllowedRange(iso)) {
        hints[key] = iso;
      }
    }
    this.invalidDateHints.set(hints);
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
          ? this._transloco.translate('processDetail.actions.datesModal.notFound')
          : this._transloco.translate('processDetail.actions.datesModal.errorGeneric');

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
