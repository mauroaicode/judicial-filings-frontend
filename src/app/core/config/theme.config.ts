/**
 * Theme Configuration
 * Controls the application theme (light mode only)
 */
export const THEME_CONFIG = {
  // Set theme to light
  defaultTheme: 'light' as const,

  // Get current theme
  getCurrentTheme(): 'light' {
    if (typeof document !== 'undefined') {
      const htmlElement = document.documentElement;
      const currentTheme = htmlElement.getAttribute('data-theme');
      return (currentTheme === 'light' ? 'light' : 'light');
    }
    return this.defaultTheme;
  },

  // Set theme
  setTheme(theme: 'light' = 'light'): void {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  },
};

