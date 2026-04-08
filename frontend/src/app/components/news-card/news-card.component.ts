import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewsPost } from '../../models/news.model';

@Component({
  selector: 'app-news-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './news-card.component.html',
  styleUrl: './news-card.component.scss',
})
export class NewsCardComponent {
  @Input({ required: true }) post!: NewsPost;

  get sourceColor(): string {
    const colors: Record<string, string> = {
      'Il Post': '#e74c3c',
      'Valigia Blu': '#3498db',
      'Linkiesta': '#2ecc71',
    };
    return colors[this.post.source] || '#95a5a6';
  }

  get formattedTime(): string {
    const date = new Date(this.post.published_at);
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
}
