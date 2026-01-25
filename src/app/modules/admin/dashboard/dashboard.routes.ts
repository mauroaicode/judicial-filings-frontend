import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard.component';

export default [
  {
    path: '',
    component: DashboardComponent,
    data: {
      title: 'navigation.dashboard',
    },
  },
] as Routes;

