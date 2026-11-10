import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { JudicialSyncLiveSource } from '@app/core/models/judicial-sync/judicial-sync.model';
import { JudicialSyncLiveService } from '@app/core/services/judicial-sync/judicial-sync-live.service';

interface LiveChip {
  key: string;
  text: string;
  startedTooltip: string;
}

interface LiveGroup {
  key: string;
  hidden: boolean;
  chips: LiveChip[];
}

interface LiveBannerView {
  marquee: boolean;
  single: boolean;
  duration: string;
  ariaLabel: string;
  groups: LiveGroup[];
}

/** ~440px por chip a 48px/s: se lee el conteo y el loop no se corta en pantallas anchas. */
const COPIES_PER_HALF = 4;
const CHIP_PX = 440;
const SPEED_PX = 48;

@Component({
  selector: 'app-judicial-sync-live-banner',
  standalone: true,
  templateUrl: './judicial-sync-live-banner.component.html',
  styleUrl: './judicial-sync-live-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudicialSyncLiveBannerComponent {
  private _live = inject(JudicialSyncLiveService);
  private _router = inject(Router);
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);

  private _lang = toSignal(this._transloco.langChanges$, {
    initialValue: this._transloco.getActiveLang(),
  });

  private _reducedMotion = signal(false);

  readonly activeTip = signal<{ text: string; x: number; y: number } | null>(null);

  readonly view = computed((): LiveBannerView | null => {
    this._lang();
    const sources = this._live.activeSources();
    if (sources.length === 0) return null;

    const texts = sources.map((source) => this._chipText(source));
    const ariaLabel = texts.join('. ');
    const marquee = sources.length > 1 && !this._reducedMotion();

    if (!marquee) {
      return {
        marquee: false,
        single: sources.length === 1,
        duration: '0s',
        ariaLabel,
        groups: [
          {
            key: 'static',
            hidden: false,
            chips: sources.map((source, index) => this._chipView(source, texts[index])),
          },
        ],
      };
    }

    const seconds = Math.max(
      18,
      Math.round((COPIES_PER_HALF * sources.length * CHIP_PX) / SPEED_PX),
    );

    return {
      marquee: true,
      single: false,
      duration: `${seconds}s`,
      ariaLabel,
      groups: [
        { key: 'a', hidden: false, chips: this._repeat(sources, texts, 'a') },
        { key: 'b', hidden: true, chips: this._repeat(sources, texts, 'b') },
      ],
    };
  });

  constructor() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._reducedMotion.set(media.matches);
    const onChange = (event: MediaQueryListEvent) => this._reducedMotion.set(event.matches);
    media.addEventListener('change', onChange);
    this._destroyRef.onDestroy(() => {
      media.removeEventListener('change', onChange);
      this.hideTip();
    });
  }

  goToJudicialSync(): void {
    void this._router.navigate(['/admin/judicial-sync']);
  }

  showTip(event: Event, text: string): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const rect = target.getBoundingClientRect();
    this.activeTip.set({
      text,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    });
  }

  hideTip(): void {
    this.activeTip.set(null);
  }

  private _chipView(source: JudicialSyncLiveSource, text: string, keySuffix = ''): LiveChip {
    const runId = source.run_id?.trim();
    const orgId = source.organization_id?.trim();
    const identity = runId || (orgId ? `${source.data_source}:${orgId}` : source.data_source);
    return {
      key: `${identity}${keySuffix}`,
      text,
      startedTooltip: this._startedTooltip(source),
    };
  }

  private _repeat(sources: JudicialSyncLiveSource[], texts: string[], prefix: string): LiveChip[] {
    const chips: LiveChip[] = [];
    for (let copy = 0; copy < COPIES_PER_HALF; copy++) {
      sources.forEach((source, index) => {
        chips.push(this._chipView(source, texts[index], `-${prefix}-${copy}`));
      });
    }
    return chips;
  }

  private _startedTooltip(source: JudicialSyncLiveSource): string {
    const label = this._displaySource(source);
    const when = this._formatStartedAt(source.started_at);
    if (when) {
      return this._transloco.translate('judicialSync.liveBanner.startedAt', {
        source: label,
        datetime: when,
      });
    }
    return this._transloco.translate('judicialSync.liveBanner.startedAtUnknown', { source: label });
  }

  private _formatStartedAt(value: string | null): string | null {
    if (value == null) return null;
    const raw = value.trim();
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const lang = this._lang() === 'en' ? 'en-US' : 'es-CO';
    return date.toLocaleString(lang, { dateStyle: 'full', timeStyle: 'short' });
  }

  private _displaySource(source: JudicialSyncLiveSource): string {
    const label = source.data_source_label?.trim() || source.data_source;
    const organization = source.organization_name?.trim();
    return organization ? `${label} · ${organization}` : label;
  }

  private _chipText(source: JudicialSyncLiveSource): string {
    const label = this._displaySource(source);
    if (source.queue_pending_jobs == null) {
      return this._transloco.translate('judicialSync.liveBanner.preparing', { source: label });
    }
    return this._transloco.translate('judicialSync.liveBanner.progress', {
      source: label,
      pending: this._formatCount(source.queue_pending_jobs),
      total: this._formatCount(source.processes_queued ?? 0),
    });
  }

  private _formatCount(value: number): string {
    const lang = this._lang() === 'en' ? 'en-US' : 'es-CO';
    return new Intl.NumberFormat(lang).format(value);
  }
}
