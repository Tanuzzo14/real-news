export interface NewsPost {
  id: number;
  source: string;
  original_url: string;
  title: string;
  content_summary: string;
  published_at: string;
  created_at: string;
  day?: string;
}

export interface NewsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface NewsResponse {
  data: NewsPost[];
  pagination: NewsPagination;
}

export interface GroupedNews {
  label: string;
  date: string;
  posts: NewsPost[];
}
