import { Injectable, signal } from '@angular/core';

export type OSType = 'ios' | 'android' | 'desktop';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({
  providedIn: 'root',
})
export class InstallService {
  /** Detected operating system */
  readonly os = signal<OSType>(this.detectOS());

  /** Whether the app is already running in standalone (installed) mode */
  readonly isStandalone = signal<boolean>(this.detectStandalone());

  /** Android: native install prompt captured from the browser */
  readonly installPrompt = signal<BeforeInstallPromptEvent | null>(null);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt.set(e as BeforeInstallPromptEvent);
    });

    window.addEventListener('appinstalled', () => {
      this.isStandalone.set(true);
      this.installPrompt.set(null);
    });
  }

  /** Trigger the native Android install banner. Resolves when the user responds. */
  async triggerAndroidInstall(): Promise<void> {
    const prompt = this.installPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      this.isStandalone.set(true);
      this.installPrompt.set(null);
    }
  }

  private detectOS(): OSType {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    if (isIOS) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'desktop';
  }

  private detectStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator &&
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
    );
  }
}
