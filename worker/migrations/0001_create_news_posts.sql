-- Migration: Create news_posts table
CREATE TABLE IF NOT EXISTS news_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  original_url TEXT UNIQUE,
  title TEXT,
  content_summary TEXT,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_posts_published_at ON news_posts(published_at DESC);
CREATE INDEX idx_news_posts_original_url ON news_posts(original_url);
