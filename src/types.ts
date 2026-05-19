export type HighlightColor = "gold" | "mint" | "coral";

export interface PageRecord {
  id: string;
  canonicalUrl: string;
  originalUrl: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface HighlightSelector {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

export interface HighlightRecord {
  id: string;
  pageId: string;
  canonicalUrl: string;
  text: string;
  color: HighlightColor;
  note: string;
  tags: string[];
  selector: HighlightSelector;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
