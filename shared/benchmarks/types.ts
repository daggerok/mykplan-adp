/// <reference lib="esnext" />
// Benchmark series (the plan section 8). Dates are ISO calendar text, prices stay plain numbers

// One trading day of a benchmark. close is the price the chart shows (NAV for the navDist feeds),
// tr is a total-return index: it starts at the first close and reinvests every distribution
export interface BenchPoint {
  ticker: string;
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  tr: number;
  nav?: number;
}

// What meta.json says about the history pages: asOf (ISO, null when the feed does not say),
// totalRows, page paths relative to meta.json (as written there) and the page size
export interface FeedMeta {
  asOf: string | null;
  totalRows: number;
  pages: string[];
  pageSize: number;
}

// A cell of the feeds: SPDR and VanEck write text ("1,234.56", "$1.1047", "-"), Vanguard numbers or null
export type Cell = string | number | null | undefined;
// Rows come as objects keyed by header (history pages) or as arrays aligned with headers (most distributions)
export type RawRow = Record<string, Cell> | Cell[];

export interface RawTable {
  headers?: string[];
  rows: RawRow[];
}

export interface FeedInput {
  ticker: string;
  history: RawTable;
  distributions?: RawTable;
}

export interface AdaptResult {
  points: BenchPoint[];
  warnings: string[];
}

export type Adapter = (input: FeedInput) => AdaptResult;

export type AdapterName = 'navDist' | 'yahoo' | 'vanguard' | 'generic';
