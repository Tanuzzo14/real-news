import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  /** User's explicit theme preference */
  readonly theme = signal<Theme>(this.loadSavedTheme());

  /** Whether dark mode is currently active (resolved from system or manual) */
  readonly isDark = signal<boolean>(false);

  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    // React to theme signal changes
    effect(() => {
      const theme = this.theme();
      this.applyTheme(theme);
      localStorage.setItem('sn-theme', theme);
    });

    // Listen for system theme changes
    this.mediaQuery.addEventListener('change', () => {
      if (this.theme() === 'system') {
        this.applyTheme('system');
      }
    });
  }

  /** Cycle through themes: system -> light -> dark -> system */
  toggle(): void {
    const current = this.theme();
    if (current === 'system') {
      this.theme.set('light');
    } else if (current === 'light') {
      this.theme.set('dark');
    } else {
      this.theme.set('system');
    }
  }

  private loadSavedTheme(): Theme {
    const saved = localStorage.getItem('sn-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'system';
  }

  private applyTheme(theme: Theme): void {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const prefersDark = this.mediaQuery.matches;
      this.isDark.set(prefersDark);
      // Don't add any class — let the CSS media query handle it
    } else {
      root.classList.add(theme);
      this.isDark.set(theme === 'dark');
    }
  }
}
