import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SearchableSelectOption {
  id: string;
  label: string;
}

/**
 * Select estilo DaisyUI (`select-bordered`) con búsqueda en el panel.
 * El panel va `absolute` bajo el trigger (contenedor `relative`) para alinear bien dentro de modales:
 * con ancestros `transform` (p. ej. `.modal-box`), `position:fixed` + coords viewport queda desfasado.
 */
@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSelectComponent {
  private _host = inject(ElementRef<HTMLElement>);

  /** Valor seleccionado (id / value de la opción) */
  value = model<string>('');

  options = input<SearchableSelectOption[]>([]);
  placeholder = input<string>('');
  searchPlaceholder = input<string>('');
  noResultsText = input<string>('');
  disabled = input<boolean>(false);
  loading = input<boolean>(false);

  searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  isOpen = signal(false);
  searchQuery = signal('');

  filteredOptions = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const opts = this.options();
    if (!q) {
      return opts;
    }
    return opts.filter((o) => o.label.toLowerCase().includes(q));
  });

  selectedLabel = computed(() => {
    const v = this.value();
    if (!v) {
      return '';
    }
    return this.options().find((o) => o.id === v)?.label ?? '';
  });

  toggle(): void {
    if (this.disabled() || this.loading()) {
      return;
    }
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.searchQuery.set('');
    this.isOpen.set(true);
    setTimeout(() => this.searchInputRef()?.nativeElement?.focus(), 0);
  }

  close(): void {
    this.isOpen.set(false);
    this.searchQuery.set('');
  }

  selectOption(option: SearchableSelectOption): void {
    this.value.set(option.id);
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.isOpen()) {
      return;
    }
    const target = ev.target as Node;
    if (this._host.nativeElement.contains(target)) {
      return;
    }
    this.close();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.isOpen()) {
      this.close();
    }
  }
}
