/// <reference lib="esnext" />
// Made-up dataset with the real shape (funds, amounts and the person are invented): the "Show demo data" button of
// the viewer, the dev server route /dev/sample-dataset.json and tests
import { mulberry32 } from './calc/monteCarlo';
import type { Dataset } from './dataset';
import type { Period, Transaction } from './model';
import type { DailyFund } from './model/records';
import { addDays, isWeekend, monthWindows } from './dates';

const HISTORY_START = '2023-05-12';
function tradingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d);
  return out;
}

export function sampleDataset(lastDay = '2026-11-20'): Dataset {
  const rnd = mulberry32(7);
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
  const funds = [
    { name: 'Example Bond Index Fund - Class X', price: 10, drift: 0.00008, vol: 0.003 },
    { name: 'Example Equity 500 Index Fund - Class K', price: 300, drift: 0.0005, vol: 0.011 },
    { name: 'Example Small-Cap Index Fund - Class Y', price: 90, drift: 0.0004, vol: 0.014 },
  ];
  const units = [100, 0, 0];
  const weights = (day: string) => (day < '2024-08-19' ? [0.2, 0.8, 0] : [0.1, 0.6, 0.3]);
  const days = tradingDays(HISTORY_START, lastDay);
  const dailyFunds: DailyFund[] = [];
  const transactions: Transaction[] = [];
  let k = 0;
  days.forEach((day, i) => {
    const payday = i % 10 === 3;
    const begUnits = units.slice();
    const begPrices = funds.map((f) => f.price);
    funds.forEach((f) => { f.price = Math.max(1, f.price * (1 + f.drift + f.vol * gauss())); });
    const contrib = [0, 0, 0];
    if (payday) {
      const w = weights(day);
      [['EE_ROTH', 40000], ['ER_MATCH', 20000]].forEach(([src, cents]) => {
        w.forEach((x, j) => {
          if (!x) return;
          const amount = Math.round((cents as number) * x);
          const u = amount / 100 / funds[j]!.price;
          units[j]! += u;
          contrib[j]! += amount;
          transactions.push({ id: `s${k++}`, activityDate: day, payCheckDate: day, fund: funds[j]!.name, source: src as Transaction['source'], type: 'contribution', rawType: src === 'EE_ROTH' ? 'Contribution - Employee Roth 401k' : 'Contribution - Employer Match w/vesting', units: u, price: funds[j]!.price, amount, origin: 'txPrint' });
        });
      });
    }
    const transfer = [0, 0, 0];
    if (day === '2024-08-19') {
      const amount = Math.round(units[1]! * funds[1]!.price * 100 * 0.25);
      units[1]! -= amount / 100 / funds[1]!.price;
      units[2]! += amount / 100 / funds[2]!.price;
      transfer[1] = -amount;
      transfer[2] = amount;
      transactions.push({ id: `s${k++}`, activityDate: day, fund: funds[1]!.name, type: 'transferOut', rawType: 'Transfer Out', amount: -amount, origin: 'txPrint' });
      transactions.push({ id: `s${k++}`, activityDate: day, fund: funds[2]!.name, type: 'transferIn', rawType: 'Transfer In', amount, origin: 'txPrint' });
    }
    funds.forEach((f, j) => {
      const begValue = Math.round(begUnits[j]! * begPrices[j]! * 100);
      const endValue = Math.round(units[j]! * f.price * 100);
      if (!begValue && !endValue) return;
      dailyFunds.push({ date: day, fund: f.name, begUnits: begUnits[j]!, begPrice: begPrices[j]!, endUnits: units[j]!, endPrice: f.price, begValue, endValue, contributions: contrib[j]!, dividends: 0, transfersIn: Math.max(transfer[j]!, 0), transfersOut: Math.min(transfer[j]!, 0), mvc: endValue - begValue - contrib[j]! - transfer[j]! });
    });
  });
  // account month periods with a "site" RoR close to the chained daily return
  const periods: Period[] = monthWindows(HISTORY_START, lastDay).map((w) => {
    const rows = dailyFunds.filter((r) => r.date >= w.from && r.date <= w.to);
    const byDay = new Map<string, { b: number; e: number; f: number }>();
    rows.forEach((r) => { const x = byDay.get(r.date) ?? { b: 0, e: 0, f: 0 }; x.b += r.begValue ?? 0; x.e += r.endValue; x.f += r.contributions; byDay.set(r.date, x); });
    let g = 1;
    byDay.forEach((x) => { if (x.b > 0) g *= 1 + (x.e - x.b - x.f) / x.b; });
    const list = Array.from(byDay.values());
    const sum = (f: (r: DailyFund) => number) => rows.reduce((a, r) => a + f(r), 0);
    return { from: w.from, to: w.to, scope: 'account', begin: list[0]?.b ?? 0, contributions: sum((r) => r.contributions), dividends: 0, transfersIn: sum((r) => r.transfersIn), transfersOut: sum((r) => r.transfersOut), mvc: sum((r) => r.mvc), end: list[list.length - 1]?.e ?? 0, personalRoR: Math.round((g - 1) * 10000 + (rnd() - 0.5) * 6) / 100 };
  });
  const transferOut = transactions.find((t) => t.type === 'transferOut');
  const transferIn = transactions.find((t) => t.type === 'transferIn');
  return {
    version: 1, builtAt: `${lastDay}T23:00:00.000Z`, asOf: lastDay,
    profile: { asOf: lastDay, hireDate: '2023-01-02', age: { years: 40, months: 5 }, birthDate: '1986-06-30', birthFrom: '1986-05-21', birthTo: '1986-06-20', birthMonth: '1986-06' },
    transactions, periods, dailyFunds,
    journal: [], journalDetails: [],
    rates: [{ date: '2023-05-20', rothPct: 6, preTaxPct: 0 }, { date: '2025-01-10', rothPct: 8, preTaxPct: 0 }],
    // the 2024-08-19 rebalance only exists when the sample reaches that day
    rebalances: transferOut && transferIn ? [{ date: '2024-08-19', out: [{ fund: funds[1]!.name, amount: transferOut.amount }], in: [{ fund: funds[2]!.name, amount: transferIn.amount }] }] : [],
    documents: [], warnings: [],
  };
}

