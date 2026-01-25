/**
 * Navigation Item Model
 * Represents a single navigation item in the sidebar menu
 */
export interface NavigationItem {
  id: string;
  title: string; // Translation key
  type: 'basic' | 'collapsable' | 'divider' | 'group';
  icon?: string; // Icon identifier (to be defined later)
  link?: string; // Route path
  active?: boolean;
  disabled?: boolean;
  hidden?: boolean | ((item: NavigationItem) => boolean);
  badge?: {
    title: string;
    classes?: string;
  };
  children?: NavigationItem[];
  meta?: {
    roles?: string[]; // Roles that can access this item
    permissions?: string[]; // Permissions required
  };
  classes?: {
    title?: string;
    icon?: string;
    wrapper?: string;
  };
}

export interface Navigation {
  default: NavigationItem[];
}

