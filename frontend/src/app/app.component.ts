import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { NewsFeedComponent } from './components/news-feed/news-feed.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, HeaderComponent, NewsFeedComponent, BottomNavComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Real News';
}
