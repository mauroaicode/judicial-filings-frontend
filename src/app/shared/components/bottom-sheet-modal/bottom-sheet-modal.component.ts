import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/** Bottom sheet en móvil y modal centrado en lg+. Proyecta `.bottom-sheet-body` y opcional `.bottom-sheet-footer`. */
@Component({
  selector: 'app-bottom-sheet-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bottom-sheet-modal.component.html',
  styleUrls: ['./bottom-sheet-modal.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomSheetModalComponent {
  /** Estado visible del diálogo (clase `modal-open`). */
  open = input.required<boolean>();

  /** Asa táctil bajo lg. */
  showMobileHandle = input<boolean>(true);

  /** Clases del backdrop Daisy (por defecto semitransparente neutro). */
  backdropClass = input<string>('bg-neutral/60');

  /**
   * Texto ya traducido para el botón invisible del backdrop (accesibilidad).
   * Si viene vacío, no se establece aria-label.
   */
  backdropAriaLabel = input<string>('');

  /** Clic en backdrop o ESC (cancel) del elemento nativo. */
  dismiss = output<void>();

  onBackdropActivate(): void {
    this.dismiss.emit();
  }

  onNativeCancel(event: Event): void {
    event.preventDefault();
    this.dismiss.emit();
  }
}
