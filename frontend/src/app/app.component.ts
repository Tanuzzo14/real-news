import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NewsFeedComponent } from './components/news-feed/news-feed.component';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, NewsFeedComponent, HeaderComponent, FooterComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Real News';
}
