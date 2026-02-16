import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

const XLSX_ACCEPT = '.xlsx';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Component({
  selector: 'app-file-drop-zone',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './file-drop-zone.component.html',
  styleUrls: ['./file-drop-zone.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileDropZoneComponent {
  private _elementRef = inject(ElementRef);

  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  accept = input<string>(XLSX_ACCEPT);
  maxSizeMb = input<number>(10);
  disabled = input<boolean>(false);
  /** When parent sets this to null (e.g. on modal cancel), clear internal file state */
  value = input<File | null>(null);

  fileChange = output<File | null>();
  error = output<string | null>();

  isDragging = signal<boolean>(false);
  selectedFile = signal<File | null>(null);
  errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.value() === null) {
        this.selectedFile.set(null);
        this.errorMessage.set(null);
      }
    });
  }

  get acceptMime(): string {
    return XLSX_MIME;
  }

  onDragOver(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this._processFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this._processFile(file);
    }
    input.value = '';
  }

  openFilePicker(): void {
    if (this.disabled()) return;
    this.fileInput()?.nativeElement?.click();
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.errorMessage.set(null);
    this.fileChange.emit(null);
    this.error.emit(null);
  }

  private _processFile(file: File): void {
    this.errorMessage.set(null);
    this.error.emit(null);

    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (ext !== '.xlsx') {
      const msg = 'processes.import.errors.invalidFormat';
      this.errorMessage.set(msg);
      this.error.emit(msg);
      this.fileChange.emit(null);
      return;
    }

    const maxBytes = this.maxSizeMb() * 1024 * 1024;
    if (file.size > maxBytes) {
      const msg = 'processes.import.errors.fileTooBig';
      this.errorMessage.set(msg);
      this.error.emit(msg);
      this.fileChange.emit(null);
      return;
    }

    this.selectedFile.set(file);
    this.fileChange.emit(file);
  }
}
