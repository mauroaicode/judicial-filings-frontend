import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Cierra el modal DaisyUI superior con Escape (evento `cancel` en el `<dialog>`). */
@Injectable({ providedIn: 'root' })
export class ModalEscapeService {
  private _initialized = false;
  private readonly _platformId = inject(PLATFORM_ID);

  init(): void {
    if (this._initialized || !isPlatformBrowser(this._platformId)) {
      return;
    }
    this._initialized = true;
    document.addEventListener('keydown', this._onDocumentKeydown);
  }

  private _onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }

    if (document.querySelector('.filter-select--open')) {
      return;
    }

    if (document.querySelector('.app-searchable-select--open')) {
      return;
    }

    const openDialogs = this._collectOpenDialogs();
    if (openDialogs.length === 0) {
      return;
    }

    const top = openDialogs[openDialogs.length - 1];
    event.preventDefault();
    top.dispatchEvent(new Event('cancel', { cancelable: true, bubbles: false }));
  };

  private _collectOpenDialogs(): HTMLDialogElement[] {
    const nodes = document.querySelectorAll(
      'dialog.modal.modal-open, dialog.modal[open], dialog.modal-open'
    );
    const unique = new Set<HTMLDialogElement>();

    nodes.forEach((node) => {
      if (!(node instanceof HTMLDialogElement)) {
        return;
      }
      if (!node.classList.contains('modal-open') && !node.hasAttribute('open')) {
        return;
      }
      unique.add(node);
    });

    return Array.from(unique).sort((a, b) => {
      if (a === b) {
        return 0;
      }
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });
  }
}
