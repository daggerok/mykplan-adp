/// <reference lib="esnext" />
// Quicken QFX from TransactionHistoryQuickenDownload.aspx (M1: OFX 1.03 SGML, application/vnd.intu.QFX).
// SGML leaf tags have no closing tag ("<UNITS>1.5"), aggregates do ("<BUYMF>...</BUYMF>"). Gives securities
// (CUSIP -> name, ticker), trades and positions, plus a reconciliation against the TransactionHistory rows
import type { Transaction } from '../model';

export interface QfxSecurity { cusip: string; name: string; ticker: string | null }
export interface QfxTrade { fitId: string; kind: string; date: string; memo: string; cusip: string; fund: string; units: number; price: number; amount: number; source: string | null }
export interface QfxPosition { cusip: string; fund: string; units: number; price: number; value: number; priceAsOf: string | null }
export interface Qfx { asOf: string | null; from: string | null; to: string | null; securities: QfxSecurity[]; trades: QfxTrade[]; positions: QfxPosition[] }

const leaf = (block: string, tag: string): string | null => block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? null;
const blocks = (text: string, tag: string): string[] => text.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gi')) ?? [];
const ofxDate = (v: string | null): string | null => (v && /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);
const num = (v: string | null): number => (v === null ? 0 : Number(v.replace(/,/g, '')) || 0);
const cents = (v: string | null): number => Math.round(num(v) * 100);

// a real SECLIST closes MFINFO; some writers do not, so the block also ends at the next MFINFO or </SECLIST>
function secInfos(text: string): string[] {
  const list = text.match(/<SECLIST>[\s\S]*?(<\/SECLIST>|$)/i)?.[0] ?? '';
  return list.split(/<MFINFO>|<STOCKINFO>|<OTHERINFO>|<DEBTINFO>|<OPTINFO>/i).slice(1);
}

export function parseQfx(text: string): Qfx {
  const securities = secInfos(text).map((b) => {
    const cusip = leaf(b, 'UNIQUEID') ?? '';
    const t = leaf(b, 'TICKER');
    return { cusip, name: leaf(b, 'SECNAME') ?? cusip, ticker: t && t !== cusip ? t : null };
  });
  const nameOf = new Map(securities.map((s) => [s.cusip, s.name]));
  const trades: QfxTrade[] = [];
  ['BUYMF', 'SELLMF', 'REINVEST', 'TRANSFER', 'INCOME', 'BUYOTHER', 'SELLOTHER'].forEach((kind) => {
    blocks(text, kind).forEach((b) => {
      const cusip = leaf(b, 'UNIQUEID') ?? '';
      const total = cents(leaf(b, 'TOTAL'));
      trades.push({
        fitId: leaf(b, 'FITID') ?? '',
        kind,
        date: ofxDate(leaf(b, 'DTTRADE')) ?? '',
        memo: leaf(b, 'MEMO') ?? '',
        cusip,
        fund: nameOf.get(cusip) ?? cusip,
        units: num(leaf(b, 'UNITS')),
        price: num(leaf(b, 'UNITPRICE')),
        // money into the fund is positive, like the site's rows (OFX writes a buy as a negative cash TOTAL)
        amount: /^(BUY|REINVEST)/.test(kind) ? Math.abs(total) : /^SELL/.test(kind) ? -Math.abs(total) : total,
        source: leaf(b, 'INV401KSOURCE'),
      });
    });
  });
  const positions = blocks(text, 'POSMF').concat(blocks(text, 'POSOTHER')).map((b) => {
    const cusip = leaf(b, 'UNIQUEID') ?? '';
    return { cusip, fund: nameOf.get(cusip) ?? cusip, units: num(leaf(b, 'UNITS')), price: num(leaf(b, 'UNITPRICE')), value: cents(leaf(b, 'MKTVAL')), priceAsOf: ofxDate(leaf(b, 'DTPRICEASOF')) };
  });
  trades.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { asOf: ofxDate(leaf(text, 'DTASOF')), from: ofxDate(leaf(text, 'DTSTART')), to: ofxDate(leaf(text, 'DTEND')), securities, trades, positions };
}

// QFX against TransactionHistory: per day and fund, the sum of money that went in (contributions + reinvested
// dividends). Differences are listed, not fixed: the site page stays the source of truth
export function reconcileQfx(q: Qfx, tx: Transaction[]): Array<{ date: string; fund: string; qfx: number; site: number }> {
  const key = (d: string, f: string) => `${d}|${f.toLowerCase()}`;
  const site = new Map<string, number>();
  tx.forEach((t) => {
    if ((t.type !== 'contribution' && t.type !== 'dividend') || (q.from && t.activityDate < q.from) || (q.to && t.activityDate > q.to)) return;
    site.set(key(t.activityDate, t.fund), (site.get(key(t.activityDate, t.fund)) ?? 0) + t.amount);
  });
  const ours = new Map<string, number>();
  q.trades.forEach((t) => { if (t.kind === 'BUYMF' || t.kind === 'REINVEST') ours.set(key(t.date, t.fund), (ours.get(key(t.date, t.fund)) ?? 0) + t.amount); });
  const out: Array<{ date: string; fund: string; qfx: number; site: number }> = [];
  new Set(Array.from(site.keys()).concat(Array.from(ours.keys()))).forEach((k) => {
    const a = ours.get(k) ?? 0;
    const b = site.get(k) ?? 0;
    if (Math.abs(a - b) > 1) { const [date, fund] = k.split('|'); out.push({ date: date!, fund: fund!, qfx: a, site: b }); }
  });
  return out.sort((x, y) => (x.date < y.date ? -1 : 1));
}
