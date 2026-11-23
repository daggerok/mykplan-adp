/// <reference lib="esnext" />
// The other records of the plan section 4 (Transaction and Period live in ./index). Money in integer cents,
// dates ISO "YYYY-MM-DD", percents in points (6.5 = 6.5 %), units and prices as plain decimals
import type { SourceCode } from '.';

export interface DailyFund {
  date: string;
  fund: string;
  begUnits: number;
  begPrice: number;
  endUnits: number;
  endPrice: number;
  endValue: number;
  contributions: number;
  transfersIn: number;
  transfersOut: number;
  mvc: number;
  // the site's own begin value of the day (cents) and the dividends of the day; both come from the one-day
  // TransactionHistoryPrint page. begValue is exact, units x price only approximates it
  begValue?: number;
  dividends?: number;
}

export interface DailyPortfolio {
  date: string;
  begin: number;
  end: number;
  externalFlow: number;
  internalFlow: number;
  mvc: number;
  dayReturn: number;
  // nav = 100 before the first day: the first row is 100 x (1 + r of day 1), see shared/calc/twr.ts
  nav: number;
  funds: string[];
}

export interface Snapshot {
  asOf: string;
  scope: 'fund' | 'source';
  key: string;
  units?: number;
  price?: number;
  value: number;
  vested?: number;
}

export interface Highlights {
  asOf: string;
  from: string;
  to: string;
  begin: number;
  contributions: number;
  credits: number;
  debits: number;
  end: number;
  ror: number;
}

export interface Contribution {
  payCheckDate: string;
  activityDate: string;
  source: SourceCode;
  fund: string;
  units: number;
  price: number;
  amount: number;
}

export interface Paycheck {
  payCheckDate: string;
  eeRoth: number;
  eePreTax: number;
  erMatch: number;
  erNec: number;
  total: number;
  eePct: number;
  // derived pay = salary: local only (the plan section 12), never written to Sheets
  impliedPay?: number;
}

export interface ElectionChange {
  requestedAt: string;
  type: string;
  system: string;
  confirmNo: string;
  oldValue?: string;
  newValue?: string;
  effectiveDate?: string;
  details: string;
}

export interface ContributionRate {
  date: string;
  rothPct: number;
  preTaxPct: number;
}

export interface Rebalance {
  date: string;
  fromFund: string;
  toFund: string;
  amount: number;
  units: number;
  price: number;
}

export interface Allocation {
  asOf: string;
  fund: string;
  assetClass: string;
  value: number;
  pct: number;
  futurePct: number;
}

export interface Statement {
  period: string;
  planNumber: string;
  contributionsThrough: string;
  preTaxPct: number;
  rothPct: number;
  ratesAsOf: string;
  vestingStart: string;
  hireDate: string;
  rorQuarter: number;
  ror1y: number;
  ror3yAnn: number;
  annuitySingle: number;
  annuityJoint: number;
  annuityRate: number;
  pdfName: string;
}

export interface SourceSummary {
  period: string;
  source: SourceCode;
  begin: number;
  contributions: number;
  dividends: number;
  mvc: number;
  end: number;
  vested: number;
  ytdContributions: number;
}

export interface Fund {
  name: string;
  assetClass: string;
  ticker?: string;
  expenseRatio?: number;
  descUrl?: string;
}

export type ReturnPeriod = 'MTD' | 'QTD' | 'YTD' | '1Y' | '3Y' | '5Y' | '10Y' | 'SI';
export const RETURN_PERIODS: ReturnPeriod[] = ['MTD', 'QTD', 'YTD', '1Y', '3Y', '5Y', '10Y', 'SI'];

export interface FundReturn {
  fund: string;
  asOf: string;
  period: ReturnPeriod;
  value: number;
}

export type StoredIn = 'fs' | 'idb' | 'export';

export interface Document {
  type: string;
  title: string;
  date: string;
  fileName: string;
  storedIn: StoredIn;
}

export type ContribMode = 'asNow' | 'fixed' | 'pctOfSalary';
export type ReturnSource = 'history' | 'fund' | 'benchmark' | 'custom';

// no salary here: "% of salary" keeps the salary itself local (the plan section 12)
export interface ContribParams {
  fixedCents?: number;
  pct?: number;
  raisePct?: number;
}

export interface EmployerRule {
  matchPct: number;
  matchUpToPct: number;
  necPct: number;
}

export interface Limits {
  year: number;
  catchUp: boolean;
}

export interface ForecastScenario {
  id: string;
  name: string;
  // local only (the plan sections 7 and 12): mykplan_scenario has no column for it
  birthDate: string;
  retireAge: number;
  horizon: number;
  contribMode: ContribMode;
  contribParams: ContribParams;
  employerRule: EmployerRule;
  limits: Limits;
  returnSource: ReturnSource;
  returnPeriod: string;
  customRate?: number;
  inflation: number;
  real: boolean;
  // goal amounts in cents
  goals: number[];
}
