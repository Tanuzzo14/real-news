import { Component, inject, signal } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { InstallService } from '../../services/install.service';

@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);
  readonly installService = inject(InstallService);

  readonly showIOSSheet = signal(false);

  get themeLabel(): string {
    const theme = this.themeService.theme();
    if (theme === 'system') return 'Auto';
    if (theme === 'dark') return 'Scuro';
    return 'Chiaro';
  }

  onInstallClick(): void {
    const os = this.installService.os();
    if (os === 'android') {
      this.installService.triggerAndroidInstall();
    } else if (os === 'ios') {
      this.showIOSSheet.set(true);
    }
  }

  closeIOSSheet(): void {
    this.showIOSSheet.set(false);
  }
}
