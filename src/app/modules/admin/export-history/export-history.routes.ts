import { Routes } from '@angular/router';
import { ExportHistoryComponent } from './export-history.component';

export default [
  {
    path: '',
    component: ExportHistoryComponent,
    data: { title: 'historialExportaciones.title' },
  },
] as Routes;
