import { NavigationItem } from '@app/core/models/navigation/navigation-item.model';

/**
 * Default navigation items
 * This will be filtered by roles in the navigation service
 */
export const DEFAULT_NAVIGATION: NavigationItem[] = [
  {
    id: 'dashboard',
    title: 'navigation.dashboard',
    type: 'basic',
    icon: 'dashboard',
    link: '/admin/dashboard',
  },
  {
    id: 'processes',
    title: 'navigation.processes',
    type: 'basic',
    icon: 'processes',
    link: '/admin/processes',
  },
  {
    id: 'organizations',
    title: 'navigation.clients',
    type: 'basic',
    icon: 'clients',
    link: '/admin/organizations',
  },
  {
    id: 'import-history',
    title: 'navigation.importHistory',
    type: 'basic',
    icon: 'importHistory',
    link: '/admin/import-history',
  },
  {
    id: 'judicial-sync',
    title: 'navigation.judicialSync',
    type: 'basic',
    icon: 'judicialSync',
    link: '/admin/judicial-sync',
  },
  // More items will be added here as needed
];

