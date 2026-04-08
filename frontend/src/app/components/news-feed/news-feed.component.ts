import {
  Component,
  OnInit,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewsService } from '../../services/news.service';
import { NewsCardComponent } from '../news-card/news-card.component';

@Component({
    selector: 'app-news-feed',
    imports: [CommonModule, NewsCardComponent],
    templateUrl: './news-feed.component.html',
    styleUrl: './news-feed.component.scss'
})
export class NewsFeedComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly newsService = inject(NewsService);

  @ViewChild('scrollAnchor') scrollAnchor!: ElementRef<HTMLDivElement>;

  private observer?: IntersectionObserver;

  readonly sources = ['Il Post', 'Valigia Blu', 'Linkiesta'];

  ngOnInit(): void {
    this.newsService.loadInitial();
  }

  ngAfterViewInit(): void {
    this.setupInfiniteScroll();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  filterBySource(source: string | null): void {
    this.newsService.filterBySource(source);
    // Re-observe after content changes
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
}
