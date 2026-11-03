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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { ProcessService } from '@app/core/services/process/process.service';
import {
  Action,
  MarkActionRemovedFromJudicialBranchResponse,
} from '@app/core/models/process/process.model';

@Component({
  selector: 'app-mark-action-removed-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './mark-action-removed-modal.component.html',
  styleUrls: ['./mark-action-removed-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkActionRemovedModalComponent {
  private _processService = inject(ProcessService);
  private _fb = inject(FormBuilder);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);

  public processId = input.required<string>();
  public action = input.required<Action>();
  public open = input<boolean>(false);

  public closed = output<void>();
  public saved = output<MarkActionRemovedFromJudicialBranchResponse>();

  public isSaving = signal(false);
  public errorMessage = signal<string | null>(null);
  public reasonError = signal<string | null>(null);

  public form = this._fb.group({
    reason: ['', [Validators.maxLength(2000)]],
    notify_organizations: [false],
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.form.reset({
        reason: '',
        notify_organizations: false,
      });
      this.errorMessage.set(null);
      this.reasonError.set(null);
      this.isSaving.set(false);
    });

    this.form
      .get('reason')
      ?.valueChanges.pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe(() => this.reasonError.set(null));
  }

  public onClose(): void {
    if (this.isSaving()) return;
    this.closed.emit();
  }

  public onConfirm(): void {
    if (this.isSaving()) return;

    this.errorMessage.set(null);
    this.reasonError.set(null);

    const reasonControl = this.form.get('reason');
    if (reasonControl?.invalid) {
      if (reasonControl.hasError('maxlength')) {
        this.reasonError.set(
          this._transloco.translate('processDetail.actions.markRemovedModal.reasonTooLong')
        );
      }
      return;
    }

    const reasonRaw = reasonControl?.value?.trim() ?? '';
    const payload = {
      notify_organizations: !!this.form.get('notify_organizations')?.value,
      reason: reasonRaw || null,
    };

    this.isSaving.set(true);
    this._processService
      .markActionRemovedFromJudicialBranch(this.processId(), this.action().id, payload)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => this.saved.emit(response),
        error: (err: HttpErrorResponse) => this._handleError(err),
      });
  }

  private _handleError(err: HttpErrorResponse): void {
    const body = err.error as { message?: string; errors?: Record<string, string[]> } | undefined;
    if (err.status === 422 && body?.errors?.['reason']?.length) {
      this.reasonError.set(body.errors['reason'][0]);
      return;
    }
    if (typeof body?.message === 'string' && body.message.trim()) {
      this.errorMessage.set(body.message);
      return;
    }
    if (err.status === 404) {
      this.errorMessage.set(this._transloco.translate('processDetail.actions.markRemovedModal.notFound'));
      return;
    }
    this.errorMessage.set(
      this._transloco.translate('processDetail.actions.markRemovedModal.errorGeneric')
    );
  }
}
