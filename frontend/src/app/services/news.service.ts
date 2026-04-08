import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NewsResponse, NewsPost, GroupedNews } from '../models/news.model';
import { environment } from '../../environments/environment';

const MS_PER_DAY = 86_400_000;

@Injectable({
  providedIn: 'root',
})
export class NewsService {
  private readonly apiUrl = `${environment.apiUrl}/api`;

  /** All loaded posts */
  readonly posts = signal<NewsPost[]>([]);

  /** Loading state */
  readonly loading = signal(false);

  /** Whether more pages are available */
  readonly hasMore = signal(true);

  /** Current page */
  private currentPage = 1;

  /** Active source filter */
  readonly activeSource = signal<string | null>(null);

  /** Posts grouped by date for display */
  readonly groupedPosts = computed<GroupedNews[]>(() => {
    const allPosts = this.posts();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().split('T')[0];

    const groups = new Map<string, { label: string; posts: NewsPost[] }>();

    for (const post of allPosts) {
      const day = post.published_at?.split('T')[0] || post.day || 'unknown';

      if (!groups.has(day)) {
        // Use server-provided period_label when available
        let label: string;
        if (post.period_label) {
          label = post.period_label;
        } else if (day === today) {
          label = 'Oggi';
        } else if (day === yesterday) {
          label = 'Ieri';
        } else {
          label = new Date(day + 'T00:00:00').toLocaleDateString('it-IT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
        }
        groups.set(day, { label, posts: [] });
      }
      groups.get(day)!.posts.push(post);
    }

    const result: GroupedNews[] = [];
    // Sort groups by date descending
    const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));

    for (const key of sortedKeys) {
      const group = groups.get(key)!;
      result.push({ label: group.label, date: key, posts: group.posts });
    }

    return result;
  });

  constructor(private http: HttpClient) {}

  /** Fetch news from the API */
  fetchNews(params?: {
    date?: string;
    page?: number;
    limit?: number;
    source?: string;
  }): Observable<NewsResponse> {
    let httpParams = new HttpParams();

    if (params?.date) httpParams = httpParams.set('date', params.date);
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    if (params?.source) httpParams = httpParams.set('source', params.source);

    return this.http.get<NewsResponse>(`${this.apiUrl}/news`, { params: httpParams });
  }

  /** Load initial page of news */
  loadInitial(): void {
    this.currentPage = 1;
    this.posts.set([]);
    this.hasMore.set(true);
    this.loadPage();
  }

  /** Load next page (infinite scroll) */
  loadMore(): void {
    if (this.loading() || !this.hasMore()) return;
    this.currentPage++;
    this.loadPage();
  }

  /** Filter by source */
  filterBySource(source: string | null): void {
    this.activeSource.set(source);
    this.loadInitial();
  }

  /** Internal: load a specific page and append results */
  private loadPage(): void {
    this.loading.set(true);

    const params: { page: number; limit: number; source?: string } = {
      page: this.currentPage,
      limit: 20,
    };

    const source = this.activeSource();
    if (source) {
      params.source = source;
    }

    this.fetchNews(params).subscribe({
      next: (response) => {
        if (this.currentPage === 1) {
          this.posts.set(response.data);
        } else {
          this.posts.update((prev) => [...prev, ...response.data]);
        }
        this.hasMore.set(this.currentPage < response.pagination.totalPages);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching news:', err);
        this.loading.set(false);
      },
    });
  }
}
