import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  OnDestroy,
  signal,
  ViewEncapsulation,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es';

export interface DateRange {
  from: string | null;
  to: string | null;
}

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateRangePickerComponent),
      multi: true,
    },
  ],
})
export class DateRangePickerComponent implements ControlValueAccessor, AfterViewInit, OnDestroy {
  private _cdr = inject(ChangeDetectorRef);

  // Inputs
  public label = input<string | undefined>(undefined);
  public placeholder = input<string>('Seleccionar rango de fechas');
  public size = input<'xs' | 'sm' | 'md' | 'lg'>('sm');
  public disabled = input<boolean>(false);

  // Internal state
  public isDisabled = signal<boolean>(false);
  public inputElement = viewChild<ElementRef<HTMLInputElement>>('dateInput');
  private flatpickrInstance: flatpickr.Instance | null = null;
  private _currentValue: DateRange | null = null;

  // ControlValueAccessor methods
  private _onChange: (value: DateRange | null) => void = () => {};
  private _onTouched: () => void = () => {};

  ngAfterViewInit(): void {
    // Initialize flatpickr after view is ready
    // Use a longer timeout to ensure the view is fully rendered
    setTimeout(() => {
      this._initFlatpickr();
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.flatpickrInstance) {
      this.flatpickrInstance.destroy();
    }
  }

  /**
   * Initialize flatpickr
   */
  private _initFlatpickr(): void {
    const inputElement = this.inputElement()?.nativeElement;
    if (!inputElement) return;

    this.flatpickrInstance = flatpickr(inputElement, {
      mode: 'range',
      dateFormat: 'Y-m-d',
      locale: Spanish,
      allowInput: true,
      clickOpens: !this.disabled() && !this.isDisabled(),
      disableMobile: false,
      onChange: (selectedDates, dateStr) => {
        if (selectedDates.length === 2) {
          const range: DateRange = {
            from: this._formatDate(selectedDates[0]),
            to: this._formatDate(selectedDates[1]),
          };
          this._currentValue = range;
          this._onChange(range);
        } else if (selectedDates.length === 1) {
          // User selected first date, waiting for second
          const range: DateRange = {
            from: this._formatDate(selectedDates[0]),
            to: null,
          };
          this._currentValue = range;
          this._onChange(range);
        } else {
          this._currentValue = { from: null, to: null };
          this._onChange({ from: null, to: null });
        }
        this._onTouched();
        this._cdr.markForCheck();
      },
      onClose: () => {
        this._onTouched();
      },
    });

    // Apply initial value if exists - wait a bit for flatpickr to be fully ready
    setTimeout(() => {
      const initialValue = this._currentValue;
      if (initialValue) {
        if (initialValue.from && initialValue.to) {
          this.flatpickrInstance?.setDate([initialValue.from, initialValue.to], false);
        } else if (initialValue.from) {
          this.flatpickrInstance?.setDate([initialValue.from], false);
        } else {
          this.flatpickrInstance?.clear();
        }
      } else {
        // Ensure input is cleared if no value
        this.flatpickrInstance?.clear();
      }
    }, 50);

    // Apply disabled state
    if (this.disabled() || this.isDisabled()) {
      this.flatpickrInstance.set('clickOpens', false);
    }
  }

  /**
   * Write value from form to component
   */
  writeValue(value: DateRange | null): void {
    this._currentValue = value;
    if (this.flatpickrInstance) {
      if (value && value.from && value.to) {
        this.flatpickrInstance.setDate([value.from, value.to], false);
      } else if (value && value.from) {
        this.flatpickrInstance.setDate([value.from], false);
      } else {
        // Clear the date picker when value is null or empty
        this.flatpickrInstance.clear();
        // Also clear the input element display
        const inputElement = this.inputElement()?.nativeElement;
        if (inputElement) {
          inputElement.value = '';
        }
      }
    }
  }

  /**
   * Register onChange function
   */
  registerOnChange(fn: (value: DateRange | null) => void): void {
    this._onChange = fn;
  }

  /**
   * Register onTouched function
   */
  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  /**
   * Set disabled state
   */
  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (this.flatpickrInstance) {
      this.flatpickrInstance.set('clickOpens', !isDisabled);
      const inputElement = this.inputElement()?.nativeElement;
      if (inputElement) {
        inputElement.disabled = isDisabled;
      }
    }
  }

  /**
   * Handle blur event
   */
  onBlur(): void {
    this._onTouched();
  }

  /**
   * Format date to YYYY-MM-DD
   */
  private _formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get input size class
   */
  getInputSizeClass(): string {
    const size = this.size();
    const sizeMap: Record<string, string> = {
      xs: 'input-xs',
      sm: 'input-sm',
      md: 'input-md',
      lg: 'input-lg',
    };
    return sizeMap[size] || 'input-sm';
  }
}
