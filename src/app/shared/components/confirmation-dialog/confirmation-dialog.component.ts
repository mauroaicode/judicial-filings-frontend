import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';

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
  /** Mensaje del cuerpo */
  message = input.required<string>();
  /** Etiqueta del botón confirmar */
  confirmLabel = input<string>('Confirmar');
  /** Etiqueta del botón cancelar */
  cancelLabel = input<string>('Cancelar');
  /** Clase DaisyUI del botón confirmar (ej. 'btn-primary', 'btn-success') */
  confirmClass = input<string>('btn-primary');

  confirm = output<void>();
  cancel = output<void>();

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
