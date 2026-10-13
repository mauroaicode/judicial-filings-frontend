import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

const DEFAULT_ACCEPT = '.xlsx';
const DEFAULT_EXTENSIONS = ['.xlsx'];

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
  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  accept = input<string>(DEFAULT_ACCEPT);
  /** Extensiones permitidas en minúsculas (con punto), p. ej. `['.pdf']`. */
  allowedExtensions = input<string[]>(DEFAULT_EXTENSIONS);
  maxSizeMb = input<number>(10);
  disabled = input<boolean>(false);
  /** Permite seleccionar / soltar varios archivos (encola en el padre). */
  multiple = input<boolean>(false);
  /**
   * Si false, no muestra el archivo único seleccionado dentro de la zona
   * (modo Excel). En multiple, la cola se muestra con `queuedFiles`.
   */
  showSelection = input<boolean>(true);
  /** Cola controlada por el padre (modo multiple): se listan dentro del recuadro. */
  queuedFiles = input<File[]>([]);
  titleKey = input<string>('processes.import.dropzoneTitle');
  subtitleKey = input<string>('processes.import.dropzoneSubtitle');
  removeLabelKey = input<string>('processes.import.removeFile');
  addMoreKey = input<string>('processes.import.dropzoneTitle');
  invalidFormatKey = input<string>('processes.import.errors.invalidFormat');
  fileTooBigKey = input<string>('processes.import.errors.fileTooBig');
  /** When parent sets this to null (e.g. on modal cancel), clear internal file state */
  value = input<File | null>(null);

  fileChange = output<File | null>();
  /** Emite los archivos aceptados de la última selección/drop (modo multiple). */
  filesChange = output<File[]>();
  /** Índice a quitar de la cola del padre. */
  removeQueuedFile = output<number>();
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
      this._handleFiles(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length) {
      this._handleFiles(files);
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

  removeQueued(index: number): void {
    this.removeQueuedFile.emit(index);
  }

  formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '–';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private _handleFiles(files: File[]): void {
    if (this.multiple()) {
      this._processMany(files);
      return;
    }
    this._processOne(files[0]);
  }

  private _processOne(file: File): void {
    this.errorMessage.set(null);
    this.error.emit(null);

    const validationError = this._validateFile(file);
    if (validationError) {
      this.errorMessage.set(validationError);
      this.error.emit(validationError);
      this.fileChange.emit(null);
      return;
    }

    this.selectedFile.set(file);
    this.fileChange.emit(file);
  }

  private _processMany(files: File[]): void {
    this.errorMessage.set(null);
    this.error.emit(null);

    const accepted: File[] = [];
    let firstError: string | null = null;

    for (const file of files) {
      const validationError = this._validateFile(file);
      if (validationError) {
        firstError ??= validationError;
        continue;
      }
      accepted.push(file);
    }

    if (firstError) {
      this.errorMessage.set(firstError);
      this.error.emit(firstError);
    }

    if (accepted.length) {
      if (this.showSelection() && accepted.length === 1) {
        this.selectedFile.set(accepted[0]);
      }
      this.filesChange.emit(accepted);
    }
  }

  private _validateFile(file: File): string | null {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const allowed = this.allowedExtensions().map((e) => e.toLowerCase());
    if (!allowed.includes(ext)) {
      return this.invalidFormatKey();
    }

    const maxBytes = this.maxSizeMb() * 1024 * 1024;
    if (file.size > maxBytes) {
      return this.fileTooBigKey();
    }

    return null;
  }
}
