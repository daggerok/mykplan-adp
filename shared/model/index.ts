/// <reference lib="esnext" />
// Records of the plan section 4. Money in integer cents, dates ISO "YYYY-MM-DD", percents in points
export type Origin = 'txPrint' | 'statement' | 'qfx';
export type SourceCode = 'EE_ROTH' | 'EE_PRETAX' | 'ER_MATCH' | 'ER_NEC';

export type TxType =
  | 'contribution'
  | 'dividend'
  | 'transferIn'
  | 'transferOut'
  | 'other';

export interface Transaction {
  id: string;
  activityDate: string;
  payCheckDate?: string;
  fund: string;
  source?: SourceCode;
  type: TxType;
  rawType: string;
  units?: number;
  price?: number;
  amount: number;
  origin: Origin;
}

export interface Period {
  from: string;
  to: string;
  // account, fund and source summaries of a window; ytd = AccountHighlights; statement = a quarterly statement
  scope: 'account' | 'fund' | 'source' | 'ytd' | 'statement';
  key?: string;
  begin: number;
  contributions: number;
  dividends: number;
  transfersIn: number;
  transfersOut: number;
  mvc: number;
  end: number;
  begUnits?: number;
  begPrice?: number;
  endUnits?: number;
  endPrice?: number;
  personalRoR?: number;
  vested?: number; // source and statement rows
  credits?: number; // ytd rows (AccountHighlights)
  debits?: number;
  ytdContributions?: number; // statement source rows
}
