import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { JudicialSyncService } from '@app/core/services/judicial-sync/judicial-sync.service';
import { JudicialSyncRun } from '@app/core/models/judicial-sync/judicial-sync.model';
import { ConfirmationDialogComponent, ConfirmationDialogDetailRow } from '@app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ProcessNumberPipe } from '@app/shared/pipes/process-number.pipe';

const PER_PAGE = 15;

function radicadoOptional(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 23) return { radicadoFormat: true };
  return null;
}

@Component({
  selector: 'app-judicial-sync',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, ConfirmationDialogComponent, ProcessNumberPipe],
  templateUrl: './judicial-sync.component.html',
  styleUrls: ['./judicial-sync.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudicialSyncComponent {
  private _fb = inject(FormBuilder);
  private _judicialSync = inject(JudicialSyncService);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);
  private _injector = inject(Injector);

  loadMoreSentinel = viewChild<ElementRef<HTMLElement>>('loadMoreSentinel');

  public runs = signal<JudicialSyncRun[]>([]);
  public initialLoading = signal<boolean>(true);
  public loadingMore = signal<boolean>(false);
  public dispatchSubmitting = signal<boolean>(false);
  public loadError = signal<boolean>(false);

  public currentPage = signal<number>(1);
  public lastPage = signal<number>(1);

  public confirmDispatchOpen = signal<boolean>(false);
  public toastMessage = signal<string | null>(null);

  /** Body normalizado solo dígitos (23) para POST */
  dispatchForm = this._fb.group({
    radicado: ['', [Validators.maxLength(64), radicadoOptional]],
  });

  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  private _intersectionObserver: IntersectionObserver | null = null;

  constructor() {
    this.reloadRuns(true);

    effect(
      () => {
        const el = this.loadMoreSentinel()?.nativeElement;
        this._intersectionObserver?.disconnect();
        this._intersectionObserver = null;
        if (!el) return;

        this._intersectionObserver = new IntersectionObserver(
          (entries) => {
            if (!entries[0]?.isIntersecting) return;
            this.loadMoreIfNeeded();
          },
          { root: null, rootMargin: '240px', threshold: 0 },
        );
        this._intersectionObserver.observe(el);
      },
      { injector: this._injector },
    );

    this._destroyRef.onDestroy(() => {
      this._intersectionObserver?.disconnect();
      if (this._toastTimer != null) {
        clearTimeout(this._toastTimer);
      }
    });
  }

  openDispatchConfirm(): void {
    if (this.dispatchForm.invalid) {
      this.dispatchForm.markAllAsTouched();
      return;
    }
    if (this.dispatchSubmitting()) return;
    this.confirmDispatchOpen.set(true);
  }

  cancelDispatchConfirm(): void {
    this.confirmDispatchOpen.set(false);
  }

  getConfirmDetailRows(): ConfirmationDialogDetailRow[] {
    const raw = String(this.dispatchForm.get('radicado')?.value ?? '').trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 23) {
      return [
        {
          label: this._transloco.translate('judicialSync.confirm.radicadoLabel'),
          value: digits,
        },
      ];
    }
    return [
      {
        label: this._transloco.translate('judicialSync.confirm.scopeLabel'),
        value: this._transloco.translate('judicialSync.confirm.scopeAll'),
      },
    ];
  }

  onConfirmDispatch(): void {
    this.confirmDispatchOpen.set(false);
    const digits = String(this.dispatchForm.get('radicado')?.value ?? '')
      .trim()
      .replace(/\D/g, '');
    const radicadoPayload = digits.length === 23 ? digits : '';

    this.dispatchSubmitting.set(true);
    this._judicialSync.dispatchSync({ radicado: radicadoPayload }).subscribe({
      next: (res) => {
        this.dispatchSubmitting.set(false);
        const msg = this._transloco.translate('judicialSync.toastSuccess', {
          jobs: String(res.jobs_dispatched),
        });
        this.showToast(msg);
        this.reloadRuns(true);
      },
      error: () => {
        this.dispatchSubmitting.set(false);
        this.showToast(this._transloco.translate('judicialSync.toastError'));
      },
    });
  }

  reloadRuns(reset: boolean): void {
    if (reset) {
      this.initialLoading.set(true);
      this.loadError.set(false);
      this.currentPage.set(1);
    }

    this._judicialSync.getRuns(reset ? 1 : this.currentPage(), PER_PAGE).subscribe({
      next: (response) => {
        if (reset) {
          this.runs.set(response.data);
        } else {
          this.runs.update((prev) => [...prev, ...response.data]);
        }
        this.currentPage.set(response.current_page);
        this.lastPage.set(response.last_page);
        this.initialLoading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.initialLoading.set(false);
        this.loadingMore.set(false);
        if (reset) {
          this.loadError.set(true);
        }
      },
    });
  }

  loadMoreIfNeeded(): void {
    if (this.initialLoading() || this.loadingMore()) return;
    if (this.currentPage() >= this.lastPage()) return;

    const nextPage = this.currentPage() + 1;
    this.loadingMore.set(true);

    this._judicialSync.getRuns(nextPage, PER_PAGE).subscribe({
      next: (response) => {
        this.runs.update((prev) => [...prev, ...response.data]);
        this.currentPage.set(response.current_page);
        this.lastPage.set(response.last_page);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  /**
   * Muestra la fecha como la envía la API si ya viene formateada; si llega ISO (compat. legado),
   * la formatea en es-CO.
   */
  formatDate(value: string | null | undefined): string {
    if (value == null) return '–';
    const s = String(value).trim();
    if (!s) return '–';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    }
    return s;
  }

  normalizedRadicado(filter: string | null | undefined): string {
    const d = String(filter ?? '').replace(/\D/g, '');
    return d.length === 23 ? d : '';
  }

  /**
   * Colores por significado — soporta slugs (`batch_completed`) y etiquetas ya traducidas por la API.
   */
  statusBadgeClass(status: string): string {
    const s = String(status ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/_/g, '');

    if (
      s.includes('completad') ||
      s.includes('finalizad') ||
      s.includes('success') ||
      s.includes('batchcompleted')
    ) {
      return 'badge-success';
    }
    if (s.includes('fail') || s.includes('error') || s.includes('fallid') || s.includes('cancelad')) {
      return 'badge-error';
    }
    if (
      s.includes('pending') ||
      s.includes('pendiente') ||
      s.includes('running') ||
      s.includes('progress') ||
      s.includes('encolad') ||
      s.includes('curso') ||
      s.includes('procesando') ||
      s.includes('ejecutando') ||
      s.includes('dispatched') ||
      s.includes('batchpending')
    ) {
      return 'badge-warning';
    }
    return 'badge-neutral';
  }

  momentTranslocoKey(moment: string | null | undefined): string {
    const m = String(moment ?? '')
      .toLowerCase()
      .trim()
      .replace(/ñ/g, 'n')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (m === 'manana') return 'judicialSync.moment.morning';
    if (m === 'tarde') return 'judicialSync.moment.afternoon';
    if (m === 'noche') return 'judicialSync.moment.night';
    if (m.includes('madrug')) return 'judicialSync.moment.dawn';
    return 'judicialSync.moment.other';
  }

  private showToast(message: string): void {
    if (this._toastTimer != null) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    this.toastMessage.set(message);
    this._toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
      this._toastTimer = null;
    }, 3400);
  }
}
