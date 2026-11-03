/**
 * @deprecated Prefer ThemeService for runtime theme switching.
 * Legacy helper kept for scripts or one-off use.
 */
export type AppTheme = 'light' | 'dark';

export const THEME_CONFIG = {
  defaultTheme: 'light' as AppTheme,

  getCurrentTheme(): AppTheme {
    if (typeof document !== 'undefined') {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      return currentTheme === 'dark' ? 'dark' : 'light';
    }
    return this.defaultTheme;
  },

  setTheme(theme: AppTheme = 'light'): void {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  },

  toggleTheme(): AppTheme {
    const next = this.getCurrentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    return next;
  },
};
