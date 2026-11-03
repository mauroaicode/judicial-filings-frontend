import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Mueve el host a `document.body` para que `position: fixed` no quede atrapado
 * por transforms/overflow de padres (p. ej. collapse, tablas con scroll).
 */
@Directive({
  selector: '[appBodyPortal]',
  standalone: true,
})
export class BodyPortalDirective implements OnInit, OnDestroy {
  private _el = inject(ElementRef<HTMLElement>);
  private _placeholder = document.createComment('app-body-portal');

  ngOnInit(): void {
    const native = this._el.nativeElement;
    const parent = native.parentNode;
    if (!parent) {
      return;
    }
    parent.insertBefore(this._placeholder, native);
    document.body.appendChild(native);
  }

  ngOnDestroy(): void {
    const native = this._el.nativeElement;
    const parent = this._placeholder.parentNode;
    if (parent) {
      parent.insertBefore(native, this._placeholder);
    }
    this._placeholder.remove();
    native.remove();
  }
}
