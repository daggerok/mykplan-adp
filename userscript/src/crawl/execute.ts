/// <reference lib="esnext" />
// One step = the requests that fetch its raw answer(s) and save them. Field names come from the live form
// (the plan section 1); every POST is a read-only query (see http.ts)
import { toUsDate } from '../../../shared/dates';
import { BASE, SiteError, getBytes, getText, postForm, siteError, windowOpenTarget, type Fetcher } from '../http';
import type { RawStore } from '../rawStore';
import type { Step } from './plan';

const TX = `${BASE}TransactionHistory.aspx`;
const QFX = `${BASE}TransactionHistoryDownloads.aspx`;
const STMT = `${BASE}RSOnDemandReports/Statements.aspx`;
const JOURNAL = `${BASE}AccountUpdatesSummary.aspx`;
const P = '_ctl0:PageContent:';

export interface Ctx {
  store: RawStore;
  fetcher?: Fetcher;
  now?: () => string;
  between?: () => Promise<void>; // pause between requests inside one step (journal details)
  log?: (line: string) => void;
  progress?: (note: string) => void; // progress inside a long step (the journal has ~210 detail pages)
}

const save = (ctx: Ctx, key: string, type: string, body: { text?: string; bytes?: Uint8Array }) =>
  ctx.store.put({ key, type, savedAt: (ctx.now ?? (() => new Date().toISOString()))(), ...body });

// a saved transaction-history page must carry its table; anything else (hold page, form page) is not data
export function validRaw(key: string, text: string | undefined): boolean {
  if (!text) return !/^tx\//.test(key);
  if (/^tx\/(fund\/|day\/)/.test(key)) return /Unit\/Share Balance/.test(text);
  if (/^tx\/source\//.test(key)) return /Activity by Source|>\s*Source\s*</.test(text);
  return true;
}

export function txFields(view: 'fund' | 'source', from: string, to: string): Record<string, string> {
  return {
    [`${P}Option`]: 'RadiobuttonTrxHistory',
    [`${P}Type`]: view === 'fund' ? 'RadioButtonFund' : 'RadioButtonSource',
    [`${P}Range`]: 'RadioButtonUDef',
    [`${P}TextBoxStartDate`]: toUsDate(from),
    [`${P}TextBoxEndDate`]: toUsDate(to),
    [`${P}btnSubmit`]: ' Submit ',
  };
}

async function txPrint(ctx: Ctx, key: string, view: 'fund' | 'source', from: string, to: string) {
  const r = await postForm(TX, txFields(view, from, to), { fetcher: ctx.fetcher });
  const err = siteError(r.url, r.text);
  if (err) throw new SiteError(`${key}: ${err}`);
  // only a real answer is saved: a page without the table (a hold or interstitial page) would block the period for good
  if (!validRaw(key, r.text)) throw new SiteError(`${key}: the answer has no ${view === 'fund' ? '"Activity by Investment Fund"' : '"Activity by Source"'} table`);
  await save(ctx, key, 'text/html', { text: r.text });
}

// "9/30/2023" option texts of the on-demand list -> ISO quarter ends
export function statementOptions(html: string): Array<{ value: string; quarterEnd: string }> {
  const select = html.match(/<select[^>]*ddlOndemandStatement[\s\S]*?<\/select>/i)?.[0] ?? '';
  const out: Array<{ value: string; quarterEnd: string }> = [];
  const re = /<option[^>]*value=["']([^"']*)["'][^>]*>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) out.push({ value: m[1]!, quarterEnd: `${m[4]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` });
  return out;
}

export async function listStatementQuarters(ctx: Ctx): Promise<string[]> {
  return statementOptions((await getText(STMT, ctx.fetcher)).text).map((o) => o.quarterEnd);
}

const firstOption = (html: string, name: string) =>
  html.match(new RegExp(`<select[^>]*${name}[\\s\\S]*?<option[^>]*value=["']([^"']*)["']`, 'i'))?.[1] ?? '';

// journal list rows -> postback target of their Detail link and the confirm number (6th cell) for the key.
// Live markup (2026-11-21): quotes inside href are entities (&#39;), the confirm number is not always a link,
// so the target comes from the link id: _ctl0_PageContent_dgATSumm__ctl2_lnkbtnDetail -> _ctl0$PageContent$dgATSumm$_ctl2$lnkbtnDetail
const cellsOf = (row: string) =>
  (row.match(/<td[\s\S]*?(?=<td|<\/tr|$)/gi) ?? []).map((c) => c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());

// One confirm number can cover two rows (seen live: one number on two rows), so the key is "<confirm>-<n>",
// n counting rows of the same number in page order (new rows with other numbers never shift it)
export function journalDetailTargets(html: string): Array<{ target: string; confirm: string; key: string }> {
  const out: Array<{ target: string; confirm: string; key: string }> = [];
  const seen = new Map<string, number>();
  html.split(/<tr[\s>]/i).forEach((row) => {
    const id = row.match(/id=["'](_ctl0_PageContent_dgATSumm__ctl\d+_lnkbtnDetail)["']/)?.[1];
    const confirm = cellsOf(row)[5]?.match(/^\d+$/)?.[0];
    if (!id || !confirm) return;
    const n = (seen.get(confirm) ?? 0) + 1;
    seen.set(confirm, n);
    out.push({ target: `_ctl0$PageContent$dgATSumm$_${id.slice('_ctl0_PageContent_dgATSumm__'.length, -'_lnkbtnDetail'.length)}$lnkbtnDetail`, confirm, key: `journal/detail/${confirm}-${n}.html` });
  });
  return out;
}

export async function executeStep(step: Step, ctx: Ctx): Promise<void> {
  switch (step.kind) {
    case 'highlights': {
      const r = await getText(`${BASE}AccountHighlights.aspx`, ctx.fetcher);
      return save(ctx, step.key, 'text/html', { text: r.text });
    }
    case 'snapshot': {
      const r = await getText(step.path, ctx.fetcher);
      return save(ctx, step.key, 'text/html', { text: r.text });
    }
    case 'txWindow':
      return txPrint(ctx, step.key, step.view, step.from, step.to);
    case 'txDay':
      return txPrint(ctx, step.key, 'fund', step.day, step.day);
    case 'statement': {
      const page = await getText(STMT, ctx.fetcher);
      const opt = statementOptions(page.text).find((o) => o.quarterEnd === step.quarterEnd);
      if (!opt) throw new SiteError(`${step.key}: quarter ${step.quarterEnd} is not in the on-demand list`);
      const r = await postForm(STMT, {
        __EVENTTARGET: '',
        __EVENTARGUMENT: '',
        [`${P}ddlOndemandStatement`]: opt.value,
        [`${P}ddlMailStatement`]: firstOption(page.text, 'ddlMailStatement'),
        [`${P}btnOndemandStmt`]: 'View Statement',
      }, { fetcher: ctx.fetcher, formHtml: page.text });
      const url = windowOpenTarget(r.text, /StatementPDF\.aspx/i, new URL(r.url || STMT, 'https://mykplan.adp.com').toString());
      if (!url) throw new SiteError(`${step.key}: no StatementPDF link in the answer`);
      const pdf = await getBytes(url, ctx.fetcher);
      if (String.fromCharCode(...Array.from(pdf.bytes.slice(0, 5))) !== '%PDF-') throw new SiteError(`${step.key}: not a PDF`);
      return save(ctx, step.key, 'application/pdf', { bytes: pdf.bytes });
    }
    case 'qfx': {
      const r = await postForm(QFX, {
        [`${P}txtStartDate`]: toUsDate(step.from),
        [`${P}txtEndDate`]: toUsDate(step.to),
        [`${P}btnDownload`]: 'Download',
      }, { fetcher: ctx.fetcher });
      const url = windowOpenTarget(r.text, /TransactionHistoryQuickenDownload\.aspx/i, new URL(r.url || QFX, 'https://mykplan.adp.com').toString());
      if (!url) throw new SiteError(`${step.key}: no Quicken download link (${siteError(r.url, r.text) ?? 'unknown answer'})`);
      const q = await getText(url, ctx.fetcher);
      if (!/OFXHEADER|<OFX>/i.test(q.text)) throw new SiteError(`${step.key}: not a QFX file`);
      return save(ctx, step.key, 'application/vnd.intu.qfx', { text: q.text });
    }
    case 'journal': {
      const list = await postForm(JOURNAL, { [`${P}TrxDate`]: 'RadiobuttonAll', [`${P}btnSubmit`]: ' Submit ' }, { fetcher: ctx.fetcher });
      await save(ctx, step.key, 'text/html', { text: list.text });
      // Detail pages: one postback + one GET each, strictly one after another (the choice lives in the session);
      // a confirm number never changes, so a saved detail is never asked again
      const targets = journalDetailTargets(list.text);
      let n = 0;
      for (const t of targets) {
        n++;
        const key = t.key;
        if (await ctx.store.has(key)) continue;
        ctx.progress?.(`journal details ${n}/${targets.length}`);
        await ctx.between?.();
        const pb = await postForm(JOURNAL, { __EVENTTARGET: t.target, __EVENTARGUMENT: '', [`${P}TrxDate`]: 'RadiobuttonAll' }, { fetcher: ctx.fetcher, formHtml: list.text });
        const url = windowOpenTarget(pb.text, /AccountUpdatesDetail\.aspx/i, new URL(pb.url || JOURNAL, 'https://mykplan.adp.com').toString());
        if (!url) { ctx.log?.(`journal ${t.confirm}: no detail link`); continue; }
        const d = await getText(url, ctx.fetcher);
        // the chosen detail lives in the server session: another tab could have switched it, so the page must carry
        // this row's confirm number (review 2026-11-22), otherwise it is not saved and is asked again next run
        if (d.text.indexOf(t.confirm) < 0) { ctx.log?.(`journal ${t.confirm}: the detail page shows another request, asked again next run`); continue; }
        await save(ctx, key, 'text/html', { text: d.text });
      }
      return;
    }
  }
}
