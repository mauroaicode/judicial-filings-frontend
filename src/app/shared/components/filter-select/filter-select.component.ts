import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface FilterSelectOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-filter-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './filter-select.component.html',
  styleUrl: './filter-select.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FilterSelectComponent),
      multi: true,
    },
  ],
})
export class FilterSelectComponent implements ControlValueAccessor {
  private _host = inject(ElementRef<HTMLElement>);
  private _destroyRef = inject(DestroyRef);

  options = input<FilterSelectOption[]>([]);
  placeholder = input<string>('');
  disabled = input(false);
  size = input<'sm' | 'md'>('sm');
  /** `auto` abre arriba si no hay espacio abajo (p. ej. paginación al pie de la tabla). */
  placement = input<'auto' | 'down' | 'up'>('auto');

  isOpen = signal(false);
  dropUp = signal(false);
  private _value = signal<string>('');
  private _formDisabled = signal(false);
  private _scrollCaptureBound = false;
  /** Evita que el mismo click de apertura cierre el panel vía document:click. */
  private _ignoreDocumentCloseUntil = 0;

  private readonly _onScrollOrResize = (): void => {
    if (this.isOpen()) {
      this.syncPanelPlacement();
    }
  };

  constructor() {
    this._destroyRef.onDestroy(() => this._detachViewportListeners());
  }

  selectedLabel = computed(() => {
    const v = this._value();
    const match = this.options().find((o) => o.id === v);
    return match?.label ?? '';
  });

  isDisabled = computed(() => this.disabled() || this._formDisabled());

  private _onChange: (value: string) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(value: string | null | undefined): void {
    this._value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._formDisabled.set(isDisabled);
  }

  onTriggerClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggle();
  }

  toggle(): void {
    if (this.isDisabled()) {
      return;
    }
    if (this.isOpen()) {
      this.close();
      return;
    }
    this._ignoreDocumentCloseUntil = performance.now() + 250;
    this.isOpen.set(true);
    this._attachViewportListeners();
    this.syncPanelPlacement();
  }

  close(): void {
    this.isOpen.set(false);
    this.dropUp.set(false);
    this._detachViewportListeners();
    this._onTouched();
  }

  selectOption(option: FilterSelectOption): void {
    this._value.set(option.id);
    this._onChange(option.id);
    this.close();
  }

  isSelected(option: FilterSelectOption): boolean {
    return this._value() === option.id;
  }

  private syncPanelPlacement(): void {
    const mode = this.placement();
    if (mode === 'up') {
      this.dropUp.set(true);
      return;
    }
    if (mode === 'down') {
      this.dropUp.set(false);
      return;
    }

    queueMicrotask(() => {
      const host = this._host.nativeElement;
      const trigger = host.querySelector('.filter-select__trigger') as HTMLElement | null;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const panelEstimatePx = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      this.dropUp.set(spaceBelow < panelEstimatePx && spaceAbove >= spaceBelow);
    });
  }

  private _attachViewportListeners(): void {
    if (this._scrollCaptureBound) {
      return;
    }
    document.addEventListener('scroll', this._onScrollOrResize, true);
    window.addEventListener('resize', this._onScrollOrResize);
    this._scrollCaptureBound = true;
  }

  private _detachViewportListeners(): void {
    if (!this._scrollCaptureBound) {
      return;
    }
    document.removeEventListener('scroll', this._onScrollOrResize, true);
    window.removeEventListener('resize', this._onScrollOrResize);
    this._scrollCaptureBound = false;
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    this._onScrollOrResize();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.isOpen()) {
      return;
    }
    if (performance.now() < this._ignoreDocumentCloseUntil) {
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
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.close();
    }
  }
}
