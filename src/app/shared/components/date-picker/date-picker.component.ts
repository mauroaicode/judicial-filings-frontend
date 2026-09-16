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
import { ISO_DATE_MAX, ISO_DATE_MIN } from '@app/core/utils/iso-date.utils';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-picker.component.html',
  styleUrls: ['./date-picker.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true,
    },
  ],
})
export class DatePickerComponent implements ControlValueAccessor, AfterViewInit, OnDestroy {
  private _cdr = inject(ChangeDetectorRef);

  public placeholder = input<string>('Seleccionar fecha');
  public size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
  public disabled = input<boolean>(false);
  public allowClear = input<boolean>(false);
  public minDate = input<string>(ISO_DATE_MIN);
  public maxDate = input<string>(ISO_DATE_MAX);
  public hasError = input<boolean>(false);

  public isDisabled = signal<boolean>(false);
  public currentValue = signal<string | null>(null);
  public inputElement = viewChild<ElementRef<HTMLInputElement>>('dateInput');
  private flatpickrInstance: flatpickr.Instance | null = null;

  private _onChange: (value: string | null) => void = () => {};
  private _onTouched: () => void = () => {};

  ngAfterViewInit(): void {
    setTimeout(() => this._initFlatpickr(), 50);
  }

  ngOnDestroy(): void {
    this.flatpickrInstance?.destroy();
  }

  writeValue(value: string | null): void {
    const next = value?.trim() ? value.trim() : null;
    this.currentValue.set(next);
    this._applyValueToPicker(next);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

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

  onBlur(): void {
    this._onTouched();
  }

  onClear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.disabled() || this.isDisabled() || !this.allowClear()) return;
    this.currentValue.set(null);
    this.flatpickrInstance?.clear();
    const inputElement = this.inputElement()?.nativeElement;
    if (inputElement) {
      inputElement.value = '';
    }
    this._onChange(null);
    this._onTouched();
    this._cdr.markForCheck();
  }

  getInputSizeClass(): string {
    const sizeMap: Record<string, string> = {
      xs: 'input-xs',
      sm: 'input-sm',
      md: 'input-md',
      lg: 'input-lg',
    };
    return sizeMap[this.size()] || 'input-md';
  }

  private _initFlatpickr(): void {
    const inputElement = this.inputElement()?.nativeElement;
    if (!inputElement) return;

    this.flatpickrInstance = flatpickr(inputElement, {
      mode: 'single',
      dateFormat: 'Y-m-d',
      locale: Spanish,
      allowInput: false,
      clickOpens: !this.disabled() && !this.isDisabled(),
      disableMobile: true,
      minDate: this.minDate(),
      maxDate: this.maxDate(),
      appendTo: document.body,
      onChange: (selectedDates) => {
        const next = selectedDates[0] ? this._formatDate(selectedDates[0]) : null;
        this.currentValue.set(next);
        this._onChange(next);
        this._onTouched();
        this._cdr.markForCheck();
      },
      onClose: () => this._onTouched(),
    });

    this._applyValueToPicker(this.currentValue());

    if (this.disabled() || this.isDisabled()) {
      this.flatpickrInstance.set('clickOpens', false);
      inputElement.disabled = true;
    }
  }

  private _applyValueToPicker(value: string | null): void {
    if (!this.flatpickrInstance) return;
    const inputElement = this.inputElement()?.nativeElement;

    if (!value) {
      this.flatpickrInstance.clear();
      if (inputElement) inputElement.value = '';
      return;
    }

    this.flatpickrInstance.setDate(value, false);
    if (inputElement && inputElement.value !== value) {
      inputElement.value = value;
    }
  }

  private _formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
