import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { NewsFeedComponent } from './components/news-feed/news-feed.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, HeaderComponent, NewsFeedComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Real News';
}
