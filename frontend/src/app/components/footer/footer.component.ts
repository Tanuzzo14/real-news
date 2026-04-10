import { Component, inject, signal, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { NewsService } from '../../services/news.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent implements OnDestroy {
  readonly newsService = inject(NewsService);

  /** Whether the search overlay is open */
  readonly searchOpen = signal(false);

  /** Spinning state for the refresh icon */
  readonly refreshSpinning = signal(false);

  private spinTimeout?: ReturnType<typeof setTimeout>;

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  /** Open PayPal support link */
  openSupport(): void {
    window.open('https://www.paypal.me/tanosma', '_blank', 'noopener,noreferrer');
  }

  /** Trigger news refresh with spinning animation */
  triggerRefresh(): void {
    if (this.newsService.loading()) return;
    this.refreshSpinning.set(true);
    this.newsService.loadInitial();

    // Ensure spinner shows for at least 600 ms for visual feedback
    this.spinTimeout = setTimeout(() => {
      this.refreshSpinning.set(false);
    }, 600);
  }

  /** Toggle search overlay */
  toggleSearch(): void {
    const next = !this.searchOpen();
    this.searchOpen.set(next);
    if (!next) {
      this.newsService.searchQuery.set('');
    } else {
      // Focus the input after the overlay transition
      setTimeout(() => this.searchInput?.nativeElement.focus(), 350);
    }
  }

  /** Close search overlay and clear query */
  closeSearch(): void {
    this.searchOpen.set(false);
    this.newsService.searchQuery.set('');
  }

  /** Allow only alphanumeric characters and spaces */
  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = input.value.replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, '');
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
    this.newsService.searchQuery.set(sanitized);
  }

  /** Handle keyboard events in search input */
  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeSearch();
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.spinTimeout);
  }
}
