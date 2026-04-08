import {
  Component,
  OnInit,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  effect,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewsService } from '../../services/news.service';
import { NewsCardComponent } from '../news-card/news-card.component';
import { SkeletonCardComponent } from '../skeleton-card/skeleton-card.component';

@Component({
    selector: 'app-news-feed',
    imports: [CommonModule, NewsCardComponent, SkeletonCardComponent],
    templateUrl: './news-feed.component.html',
    styleUrl: './news-feed.component.scss'
})
export class NewsFeedComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly newsService = inject(NewsService);
  private readonly ngZone = inject(NgZone);

  @ViewChild('scrollAnchor') scrollAnchor!: ElementRef<HTMLDivElement>;
  @ViewChild('feedContainer') feedContainer!: ElementRef<HTMLDivElement>;

  private observer?: IntersectionObserver;

  readonly sources = ['Il Post', 'Valigia Blu', 'Linkiesta'];

  /** Pull-to-refresh state */
  readonly refreshing = signal(false);
  readonly pullDistance = signal(0);
  readonly isPulling = signal(false);

  private touchStartY = 0;
  private readonly PULL_THRESHOLD = 80;

  /** Whether this is the very first load (show skeleton screens) */
  readonly initialLoading = signal(true);

  /** Opacity for pull-to-refresh indicator based on pull distance */
  pullOpacity(): number {
    return Math.min(this.pullDistance() / 80, 1);
  }

  constructor() {
    // Reactively hide skeleton/refreshing when loading completes
    effect(() => {
      const loading = this.newsService.loading();
      const hasPosts = this.newsService.posts().length > 0;

      if (!loading || hasPosts) {
        this.initialLoading.set(false);
      }
      if (!loading) {
        this.refreshing.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.newsService.loadInitial();
  }

  ngAfterViewInit(): void {
    this.setupInfiniteScroll();
    this.setupPullToRefresh();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  filterBySource(source: string | null): void {
    this.newsService.filterBySource(source);
    this.initialLoading.set(true);
    setTimeout(() => this.setupInfiniteScroll(), 100);
  }

  private setupInfiniteScroll(): void {
    this.observer?.disconnect();

    if (!this.scrollAnchor) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          this.newsService.loadMore();
        }
      },
      { threshold: 0.1 },
    );

    this.observer.observe(this.scrollAnchor.nativeElement);
  }

  private setupPullToRefresh(): void {
    const el = this.feedContainer?.nativeElement;
    if (!el) return;

    this.ngZone.runOutsideAngular(() => {
      el.addEventListener('touchstart', (e: TouchEvent) => {
        if (window.scrollY === 0) {
          this.touchStartY = e.touches[0].clientY;
          this.ngZone.run(() => this.isPulling.set(true));
        }
      }, { passive: true });

      el.addEventListener('touchmove', (e: TouchEvent) => {
        if (!this.isPulling()) return;
        const diff = e.touches[0].clientY - this.touchStartY;
        if (diff > 0 && window.scrollY === 0) {
          this.ngZone.run(() => this.pullDistance.set(Math.min(diff * 0.5, 120)));
        }
      }, { passive: true });

      el.addEventListener('touchend', () => {
        if (this.pullDistance() >= this.PULL_THRESHOLD) {
          this.ngZone.run(() => {
            this.refreshing.set(true);
            this.pullDistance.set(0);
            this.isPulling.set(false);
            this.newsService.loadInitial();
          });
        } else {
          this.ngZone.run(() => {
            this.pullDistance.set(0);
            this.isPulling.set(false);
          });
        }
      }, { passive: true });
    });
  }
}
