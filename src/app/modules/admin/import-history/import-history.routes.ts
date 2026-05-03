import { Routes } from '@angular/router';
import { ImportHistoryComponent } from './import-history.component';

export default [
  {
    path: '',
    component: ImportHistoryComponent,
    data: { title: 'historialImportaciones.title' },
  },
] as Routes;
