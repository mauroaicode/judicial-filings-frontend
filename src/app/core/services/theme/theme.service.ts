import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AppTheme = 'light' | 'dark';

/**
 * Manages application color theme (light / dark).
 *
 * Priority order:
 *  1. User's saved preference (localStorage)
 *  2. OS / browser system preference (prefers-color-scheme)
 *  3. Default: light
 *
 * The active theme is stored as `data-theme` on <html> so DaisyUI picks it up
 * automatically. A MediaQueryList listener reacts to system changes only when
 * the user has not overridden the preference manually.
 *
 * Auth screens (login / forgot) can temporarily force light without changing
 * the stored preference; release restores the preferred theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Shared with judicial-filings-frontend so preference stays in sync on same origin. */
  static readonly STORAGE_KEY = 'notijudicial-theme';

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly isDark = signal<boolean>(false);

  private authLightLockCount = 0;

  private get authLightLock(): boolean {
    return this.authLightLockCount > 0;
  }

  constructor() {
    if (this.isBrowser) {
      this._init();
    }
  }

  toggle(): void {
    if (this.authLightLock) {
      return;
    }
    const next = !this.isDark();
    try {
      localStorage.setItem(ThemeService.STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // Silently ignore storage errors (e.g. private/incognito restrictions)
    }
    this._apply(next);
  }

  setTheme(theme: AppTheme): void {
    if (this.authLightLock) {
      return;
    }
    try {
      localStorage.setItem(ThemeService.STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
    this._apply(theme === 'dark');
  }

  lockAuthLight(): void {
    if (!this.isBrowser) {
      return;
    }
    this.authLightLockCount += 1;
    document.documentElement.setAttribute('data-theme', 'light');
  }

  unlockAuthLight(): void {
    if (!this.isBrowser) {
      return;
    }
    this.authLightLockCount = Math.max(0, this.authLightLockCount - 1);
    if (this.authLightLockCount === 0) {
      queueMicrotask(() => {
        if (this.authLightLockCount === 0) {
          this._apply(this._resolvePreferredDark());
        }
      });
    }
  }

  private _init(): void {
    this._apply(this._resolvePreferredDark());

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ({ matches }) => {
      if (this.authLightLock) {
        return;
      }
      let hasSaved = false;
      try {
        hasSaved = localStorage.getItem(ThemeService.STORAGE_KEY) !== null;
      } catch {
        /* noop */
      }
      if (!hasSaved) {
        this._apply(matches);
      }
    });
  }

  private _resolvePreferredDark(): boolean {
    let saved: AppTheme | null = null;
    try {
      saved = localStorage.getItem(ThemeService.STORAGE_KEY) as AppTheme | null;
    } catch {
      /* noop */
    }

    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return saved !== null ? saved === 'dark' : sysDark;
  }

  private _apply(isDark: boolean): void {
    this.isDark.set(isDark);
    if (this.authLightLock) {
      document.documentElement.setAttribute('data-theme', 'light');
      return;
    }
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }
}
