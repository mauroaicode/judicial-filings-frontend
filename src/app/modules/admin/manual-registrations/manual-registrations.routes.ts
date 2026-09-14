import { Routes } from '@angular/router';
import { ManualRegistrationsComponent } from './manual-registrations.component';

export default [
  {
    path: '',
    component: ManualRegistrationsComponent,
    data: { title: 'manualRegistrations.title' },
  },
] as Routes;
