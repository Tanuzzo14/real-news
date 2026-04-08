import { Component, inject } from '@angular/core';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly themeService = inject(ThemeService);

  get themeIcon(): string {
    const theme = this.themeService.theme();
    if (theme === 'system') return '◐';
    if (theme === 'dark') return '☾';
    return '☀';
  }

  get themeLabel(): string {
    const theme = this.themeService.theme();
    if (theme === 'system') return 'Auto';
    if (theme === 'dark') return 'Scuro';
    return 'Chiaro';
  }
}
