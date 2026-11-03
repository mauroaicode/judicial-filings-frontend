import { Pipe, PipeTransform } from '@angular/core';

/** Primera letra mayúscula; el resto minúsculas (p. ej. ACTIVO → Activo). */
@Pipe({
  name: 'badgeLabel',
  standalone: true,
})
export class BadgeLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (value == null || !String(value).trim()) {
      return '';
    }
    const lower = String(value).trim().toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
}
