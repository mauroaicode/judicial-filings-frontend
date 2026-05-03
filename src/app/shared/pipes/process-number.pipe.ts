import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'processNumber',
  standalone: true,
})
export class ProcessNumberPipe implements PipeTransform {
  /** Formato estándar Colombia: XX-XXX-XX-XX-XXX-YYYY-XXXXX-ZZ (23 dígitos). Igual que judicial-filings-frontend. */
  transform(value: string | number | null | undefined): string {
    if (!value) {
      return '';
    }
    const clean = value.toString().replace(/\D/g, '');
    if (clean.length !== 23) {
      return value.toString();
    }
    const parts = [
      clean.slice(0, 2),
      clean.slice(2, 5),
      clean.slice(5, 7),
      clean.slice(7, 9),
      clean.slice(9, 12),
      clean.slice(12, 16),
      clean.slice(16, 21),
      clean.slice(21, 23),
    ];
    return parts.join('-');
  }
}
