import { Routes } from '@angular/router';
import { JudicialSyncComponent } from './judicial-sync.component';

export default [
  {
    path: '',
    component: JudicialSyncComponent,
    data: { title: 'judicialSync.title' },
  },
] as Routes;
