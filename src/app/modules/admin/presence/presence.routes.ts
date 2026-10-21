import { Routes } from '@angular/router';
import { PresenceComponent } from './presence.component';

export default [
  {
    path: '',
    component: PresenceComponent,
    data: { title: 'presence.title' },
  },
] as Routes;
