import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
    title: 'Home',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
