import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewsPost } from '../../models/news.model';

@Component({
    selector: 'app-news-card',
    imports: [CommonModule],
    templateUrl: './news-card.component.html',
    styleUrl: './news-card.component.scss'
})
export class NewsCardComponent {
  @Input({ required: true }) post!: NewsPost;

  /** Whether the card is currently being pressed (touch feedback) */
  pressed = false;

  get sourceColor(): string {
    const colors: Record<string, string> = {
      'Il Post': 'var(--color-source-ilpost)',
      'Valigia Blu': 'var(--color-source-valigiablu)',
      'Linkiesta': 'var(--color-source-linkiesta)',
    };
    return colors[this.post.source] || '#95a5a6';
  }

  get sourceInitial(): string {
    return this.post.source.charAt(0).toUpperCase();
  }

  get relativeTime(): string {
    const now = Date.now();
    const published = new Date(this.post.published_at).getTime();
    const diffMs = now - published;
    const diffMinutes = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMinutes < 1) return 'ora';
    if (diffMinutes < 60) return `${diffMinutes}m fa`;
    if (diffHours < 24) return `${diffHours}h fa`;
    if (diffDays < 7) return `${diffDays}g fa`;

    return new Date(this.post.published_at).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
    });
  }

  /** Parse content_summary into bullet points or paragraphs */
  get summaryPoints(): string[] {
    if (!this.post.content_summary) return [];

    // Split on common bullet patterns: lines starting with •, -, *, or numbered
    const lines = this.post.content_summary
      .split(/\n/)
      .map(line => line.replace(/^[\s]*[•\-\*]\s*/, '').trim())
      .filter(line => line.length > 0);

    return lines;
  }

  get hasTitle(): boolean {
    return !!this.post.title && this.post.title.trim().length > 0;
  }
}
