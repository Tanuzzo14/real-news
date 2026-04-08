import { Component, signal } from '@angular/core';

export type NavTab = 'feed' | 'fonti' | 'salvati';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss',
})
export class BottomNavComponent {
  readonly activeTab = signal<NavTab>('feed');

  setTab(tab: NavTab): void {
    this.activeTab.set(tab);
  }
}
