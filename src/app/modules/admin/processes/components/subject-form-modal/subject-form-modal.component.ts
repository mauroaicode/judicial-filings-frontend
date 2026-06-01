import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize } from 'rxjs/operators';
import { ProcessService } from '@app/core/services/process/process.service';
import { SaveProcessSubjectsResponse, Subject } from '@app/core/models/process/process.model';

@Component({
  selector: 'app-subject-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './subject-form-modal.component.html',
  styleUrls: ['./subject-form-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubjectFormModalComponent {
  private _processService = inject(ProcessService);
  private _fb = inject(FormBuilder);

  public processId = input.required<string>();
  /** Si viene, modo edición; si no, modo creación */
  public subject = input<Subject | null>(null);

  public closed = output<void>();
  public saved = output<SaveProcessSubjectsResponse>();

  public isSaving = signal(false);
  public errorMessage = signal<string | null>(null);

  public subjectForm = this._fb.group({
    subject_type: ['', [Validators.required, Validators.maxLength(120)]],
    name_or_business_name: ['', [Validators.required, Validators.maxLength(255)]],
  });

  constructor() {
    effect(() => {
      const current = this.subject();
      if (current) {
        this.subjectForm.patchValue({
          subject_type: current.subject_type ?? '',
          name_or_business_name: current.name_or_business_name ?? '',
        });
      } else {
        this.subjectForm.reset({
          subject_type: '',
          name_or_business_name: '',
        });
      }
      this.errorMessage.set(null);
    });
  }

  public isEditMode(): boolean {
    return !!this.subject()?.id;
  }

  public onClose(): void {
    this.closed.emit();
  }

  public onSave(): void {
    if (this.subjectForm.invalid || this.isSaving()) {
      this.subjectForm.markAllAsTouched();
      return;
    }

    const processId = this.processId();
    const formValue = this.subjectForm.getRawValue();
    const payload: { id?: string; subject_type: string; name_or_business_name: string } = {
      subject_type: (formValue.subject_type ?? '').trim(),
      name_or_business_name: (formValue.name_or_business_name ?? '').trim(),
    };

    const subjectId = this.subject()?.id;
    if (subjectId) {
      payload.id = subjectId;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this._processService
      .saveProcessSubjects(processId, [payload])
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => this.saved.emit(response),
        error: (err) => {
          const body = err?.error;
          if (body?.message && typeof body.message === 'string') {
            this.errorMessage.set(body.message);
            return;
          }
          if (body?.errors && typeof body.errors === 'object') {
            const messages = Object.values(body.errors as Record<string, string[]>)
              .flat()
              .filter(Boolean);
            if (messages.length) {
              this.errorMessage.set(messages.join(' '));
              return;
            }
          }
          this.errorMessage.set('processDetail.subjects.modal.errorGeneric');
        },
      });
  }
}
