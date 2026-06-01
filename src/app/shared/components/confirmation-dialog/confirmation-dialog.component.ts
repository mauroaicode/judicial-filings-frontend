import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/** Fila destacada en el modo estructurado (ej. archivo + valor a confirmar). */
export type ConfirmationDialogDetailRow = { label: string; value: string };

/**
 * Diálogo de confirmación reutilizable (modal DaisyUI).
 * Para flujos confirmar/cancelar: eliminar, crear organización, etc.
 */
@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-dialog.component.html',
  styleUrls: ['./confirmation-dialog.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationDialogComponent {
  /** Si el diálogo está abierto */
  open = input.required<boolean>();
  /** Título del diálogo */
  title = input.required<string>();
  /**
   * Texto introductorio corto (opcional).
   * Sin `detailRows`, es el mensaje único como antes.
   */
  message = input<string>('');
  /**
   * Si se define y tiene filas: se muestran archivo/datos destacados antes de continuar.
   */
  detailRows = input<ConfirmationDialogDetailRow[] | undefined>(undefined);
  /** Nota opcional debajo del bloque de detalles (ej. proceso en segundo plano). */
  footnote = input<string | undefined>(undefined);
  /** Etiqueta del botón confirmar */
  confirmLabel = input<string>('Confirmar');
  /** Etiqueta del botón cancelar */
  cancelLabel = input<string>('Cancelar');
  /** Clase DaisyUI del botón confirmar (negro por defecto) */
  confirmClass = input<string>('btn-neutral');

  confirm = output<void>();
  cancel = output<void>();

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
