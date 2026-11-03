import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { JudicialSyncLiveSource } from '@app/core/models/judicial-sync/judicial-sync.model';
import { JudicialSyncLiveService } from '@app/core/services/judicial-sync/judicial-sync-live.service';

interface LiveChip {
  key: string;
  text: string;
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
  private _transloco = inject(TranslocoService);
  private _destroyRef = inject(DestroyRef);

  private _lang = toSignal(this._transloco.langChanges$, {
    initialValue: this._transloco.getActiveLang(),
  });

  private _reducedMotion = signal(false);

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
            chips: sources.map((source, index) => ({
              key: source.data_source,
              text: texts[index],
            })),
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
    this._destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
  }

  private _repeat(sources: JudicialSyncLiveSource[], texts: string[], prefix: string): LiveChip[] {
    const chips: LiveChip[] = [];
    for (let copy = 0; copy < COPIES_PER_HALF; copy++) {
      sources.forEach((source, index) => {
        chips.push({
          key: `${prefix}-${source.data_source}-${copy}`,
          text: texts[index],
        });
      });
    }
    return chips;
  }

  private _chipText(source: JudicialSyncLiveSource): string {
    const label = source.data_source_label?.trim() || source.data_source;
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
