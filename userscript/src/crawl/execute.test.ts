/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import type { Fetcher } from '../http';
import { memoryStore } from '../rawStore';
import { executeStep, journalDetailTargets, statementOptions, txFields } from './execute';

const ORIGIN = 'https://mykplan.adp.com';
const FORM = '<input type="hidden" name="__VIEWSTATE" value="vs" /><input type="hidden" name="__VIEWSTATEGENERATOR" value="g" />';
const res = (url: string, body: string | Uint8Array, type = 'text/html') =>
  ({ url: ORIGIN + url, ok: true, status: 200, type: 'basic', headers: new Headers({ 'content-type': type }),
     text: async () => (typeof body === 'string' ? body : new TextDecoder().decode(body)),
     arrayBuffer: async () => (typeof body === 'string' ? new TextEncoder().encode(body) : body).buffer }) as unknown as Response;

// a tiny fake mykplan: answers by path and method, records every request
function fakeSite(routes: Record<string, (body?: URLSearchParams) => Response>) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (input, init) => {
    const path = input.replace(ORIGIN, '').split('?')[0]!;
    const key = `${init?.method ?? 'GET'} ${path}`;
    calls.push(key);
    const route = routes[key];
    if (!route) throw new Error(`unexpected ${key}`);
    return route(init?.body as URLSearchParams | undefined);
  };
  return { fetcher, calls };
}

const STMT_PAGE = `${FORM}<select name="_ctl0:PageContent:ddlOndemandStatement"><option value="a~20260701~20260930">9/30/2026</option><option value="a~20230701~20230930">9/30/2023</option></select>
<select name="_ctl0:PageContent:ddlMailStatement"><option value="07/01/2026 - 09/30/2026">07/01/2026 - 09/30/2026</option></select>`;

describe('executeStep', () => {
  test('a day of the transaction history: fresh GET, POST with the live field names, saved raw', async () => {
    let posted: URLSearchParams | undefined;
    const site = fakeSite({
      'GET /ParticipantSecure_Net/TransactionHistory.aspx': () => res('/ParticipantSecure_Net/TransactionHistory.aspx', FORM),
      'POST /ParticipantSecure_Net/TransactionHistory.aspx': (b) => { posted = b; return res('/ParticipantSecure_Net/TransactionHistoryPrint.aspx', '<html><td>Unit/Share Balance</td></html>'); },
    });
    const store = memoryStore();
    await executeStep({ kind: 'txDay', key: 'tx/day/2024-06-14.html', day: '2024-06-14' }, { store, fetcher: site.fetcher, now: () => 'T' });
    expect(posted!.get('_ctl0:PageContent:TextBoxStartDate')).toBe('06/14/2024');
    expect(posted!.get('_ctl0:PageContent:TextBoxEndDate')).toBe('06/14/2024');
    expect(posted!.get('__VIEWSTATE')).toBe('vs');
    expect(store.map.get('tx/day/2024-06-14.html')).toEqual({ key: 'tx/day/2024-06-14.html', type: 'text/html', savedAt: 'T', text: '<html><td>Unit/Share Balance</td></html>' });
  });

  test('an ErrorP answer fails the step and saves nothing', async () => {
    const site = fakeSite({
      'GET /ParticipantSecure_Net/TransactionHistory.aspx': () => res('/x', FORM),
      'POST /ParticipantSecure_Net/TransactionHistory.aspx': () => res('/ParticipantSecure_Net/ErrorP.aspx', 'The date range cannot exceed 13 months. To continue'),
    });
    const store = memoryStore();
    await expect(executeStep({ kind: 'txWindow', key: 'k', view: 'fund', from: '2023-05-12', to: '2026-11-20' }, { store, fetcher: site.fetcher })).rejects.toThrow('cannot exceed 13 months');
    expect(store.map.size).toBe(0);
  });

  test('a statement: list, postback, then the PDF from the window.open target', async () => {
    let posted: URLSearchParams | undefined;
    const site = fakeSite({
      'GET /ParticipantSecure_Net/RSOnDemandReports/Statements.aspx': () => res('/ParticipantSecure_Net/RSOnDemandReports/Statements.aspx', STMT_PAGE),
      'POST /ParticipantSecure_Net/RSOnDemandReports/Statements.aspx': (b) => { posted = b; return res('/ParticipantSecure_Net/RSOnDemandReports/Statements.aspx', "<script>window.open('StatementPDF.aspx?rand=0.1')</script>"); },
      'GET /ParticipantSecure_Net/RSOnDemandReports/StatementPDF.aspx': () => res('/ParticipantSecure_Net/RSOnDemandReports/StatementPDF.aspx', new TextEncoder().encode('%PDF-1.4 x'), 'application/pdf'),
    });
    const store = memoryStore();
    await executeStep({ kind: 'statement', key: 'stmt/2023-09-30.pdf', quarterEnd: '2023-09-30' }, { store, fetcher: site.fetcher });
    expect(posted!.get('_ctl0:PageContent:ddlOndemandStatement')).toBe('a~20230701~20230930');
    expect(posted!.get('_ctl0:PageContent:btnOndemandStmt')).toBe('View Statement');
    expect(site.calls).toEqual(['GET /ParticipantSecure_Net/RSOnDemandReports/Statements.aspx', 'POST /ParticipantSecure_Net/RSOnDemandReports/Statements.aspx', 'GET /ParticipantSecure_Net/RSOnDemandReports/StatementPDF.aspx']);
    expect(store.map.get('stmt/2023-09-30.pdf')!.type).toBe('application/pdf');
  });

  test('quicken: postback, then the QFX', async () => {
    const site = fakeSite({
      'GET /ParticipantSecure_Net/TransactionHistoryDownloads.aspx': () => res('/ParticipantSecure_Net/TransactionHistoryDownloads.aspx', FORM),
      'POST /ParticipantSecure_Net/TransactionHistoryDownloads.aspx': () => res('/ParticipantSecure_Net/TransactionHistoryDownloads.aspx', "<script>window.open('TransactionHistoryQuickenDownload.aspx')</script>"),
      'GET /ParticipantSecure_Net/TransactionHistoryQuickenDownload.aspx': () => res('/ParticipantSecure_Net/TransactionHistoryQuickenDownload.aspx', 'OFXHEADER:100\n<OFX>', 'application/vnd.intu.QFX'),
    });
    const store = memoryStore();
    await executeStep({ kind: 'qfx', key: 'qfx/a.qfx', from: '2023-05-12', to: '2024-05-11' }, { store, fetcher: site.fetcher });
    expect(store.map.get('qfx/a.qfx')!.text).toContain('<OFX>');
  });

  test('journal: the list, then only the details not saved yet', async () => {
    const row = (n: number, confirm: string) => `<tr><td>01/0${n}/2026 10:00:00</td><td>Investment Allocation</td><td>Add</td><td>Internet</td><td>PARTICIPANT</td><td>${confirm}</td><td></td><td><a id="_ctl0_PageContent_dgATSumm__ctl${n}_lnkbtnDetail" href="javascript:__doPostBack(&#39;_ctl0$PageContent$dgATSumm$_ctl${n}$lnkbtnDetail&#39;,&#39;&#39;)">Detail</a></td></tr>`;
    const list = `${FORM}<table>${row(2, '111')}${row(3, '222')}${row(4, '222')}</table>`;
    const targets: string[] = [];
    const site = fakeSite({
      'GET /ParticipantSecure_Net/AccountUpdatesSummary.aspx': () => res('/ParticipantSecure_Net/AccountUpdatesSummary.aspx', FORM),
      'POST /ParticipantSecure_Net/AccountUpdatesSummary.aspx': (b) => {
        const t = b!.get('__EVENTTARGET');
        if (t) { targets.push(t); return res('/ParticipantSecure_Net/AccountUpdatesSummary.aspx', "<script>window.open('AccountUpdatesDetail.aspx')</script>"); }
        return res('/ParticipantSecure_Net/AccountUpdatesSummary.aspx', list);
      },
      // the detail page shows the confirm number of the row asked last (_ctl2 -> 111, _ctl3 and _ctl4 -> 222)
      'GET /ParticipantSecure_Net/AccountUpdatesDetail.aspx': () => res('/ParticipantSecure_Net/AccountUpdatesDetail.aspx', `<p>detail ${targets.length} Confirm #: ${/_ctl2\$/.test(targets[targets.length - 1] ?? '') ? '111' : '222'}</p>`),
    });
    const store = memoryStore();
    await store.put({ key: 'journal/detail/111-1.html', type: 'text/html', savedAt: 'old', text: 'kept' });
    await executeStep({ kind: 'journal', key: 'journal/2026-11-21.html' }, { store, fetcher: site.fetcher });
    expect(targets).toEqual(['_ctl0$PageContent$dgATSumm$_ctl3$lnkbtnDetail', '_ctl0$PageContent$dgATSumm$_ctl4$lnkbtnDetail']);
    expect(await store.keys('journal/')).toEqual(['journal/2026-11-21.html', 'journal/detail/111-1.html', 'journal/detail/222-1.html', 'journal/detail/222-2.html']);
    expect(store.map.get('journal/detail/111-1.html')!.text).toBe('kept');
    expect(journalDetailTargets(list).map((t) => t.key)).toEqual(['journal/detail/111-1.html', 'journal/detail/222-1.html', 'journal/detail/222-2.html']);
  });
});

test('helpers', () => {
  expect(statementOptions(STMT_PAGE)).toEqual([{ value: 'a~20260701~20260930', quarterEnd: '2026-09-30' }, { value: 'a~20230701~20230930', quarterEnd: '2023-09-30' }]);
  expect(txFields('source', '2024-06-01', '2024-06-30')['_ctl0:PageContent:Type']).toBe('RadioButtonSource');
});

test('a hold page is an ended session, never saved as data; broken saved pages are recognized', async () => {
  const { validRaw } = await import('./execute');
  const HOLD = '<html><body>This page is used to hold your data while you are being authorized for your request. <form><input type="submit" value="Continue"></form></body></html>';
  const site = fakeSite({
    'GET /ParticipantSecure_Net/TransactionHistory.aspx': () => res('/ParticipantSecure_Net/TransactionHistory.aspx', FORM),
    'POST /ParticipantSecure_Net/TransactionHistory.aspx': () => res('/ParticipantSecure_Net/TransactionHistoryPrint.aspx', HOLD),
  });
  const store = memoryStore();
  const { SessionExpired } = await import('../http');
  await expect(executeStep({ kind: 'txDay', key: 'tx/day/2024-06-14.html', day: '2024-06-14' }, { store, fetcher: site.fetcher })).rejects.toBeInstanceOf(SessionExpired);
  expect(store.map.size).toBe(0);
  expect(validRaw('tx/day/2024-06-14.html', HOLD)).toBe(false);
  expect(validRaw('tx/fund/month/a.html', '<td>Unit/Share Balance</td>')).toBe(true);
  expect(validRaw('tx/source/month/a.html', '<td>Activity by Source</td>')).toBe(true);
  expect(validRaw('journal/x.html', 'anything')).toBe(true);
});

test('a print page without its table is not saved (site error, not retried)', async () => {
  const site = fakeSite({
    'GET /ParticipantSecure_Net/TransactionHistory.aspx': () => res('/ParticipantSecure_Net/TransactionHistory.aspx', FORM),
    'POST /ParticipantSecure_Net/TransactionHistory.aspx': () => res('/ParticipantSecure_Net/TransactionHistoryPrint.aspx', '<html>empty</html>'),
  });
  const store = memoryStore();
  await expect(executeStep({ kind: 'txWindow', key: 'tx/fund/month/a.html', view: 'fund', from: '2024-06-01', to: '2024-06-30' }, { store, fetcher: site.fetcher })).rejects.toThrow('has no');
  expect(store.map.size).toBe(0);
});

test('a journal detail page that shows another request is not saved', async () => {
  const row = `<tr><td>01/02/2026 10:00:00</td><td>Investment Allocation</td><td>Add</td><td>Internet</td><td>PARTICIPANT</td><td>333</td><td></td><td><a id="_ctl0_PageContent_dgATSumm__ctl2_lnkbtnDetail" href="#">Detail</a></td></tr>`;
  const site = fakeSite({
    'GET /ParticipantSecure_Net/AccountUpdatesSummary.aspx': () => res('/ParticipantSecure_Net/AccountUpdatesSummary.aspx', FORM),
    'POST /ParticipantSecure_Net/AccountUpdatesSummary.aspx': (b) => res('/ParticipantSecure_Net/AccountUpdatesSummary.aspx', b!.get('__EVENTTARGET') ? "<script>window.open('AccountUpdatesDetail.aspx')</script>" : `${FORM}<table>${row}</table>`),
    'GET /ParticipantSecure_Net/AccountUpdatesDetail.aspx': () => res('/ParticipantSecure_Net/AccountUpdatesDetail.aspx', '<p>Confirm #: 999</p>'),
  });
  const store = memoryStore();
  const logs: string[] = [];
  await executeStep({ kind: 'journal', key: 'journal/2026-11-22.html' }, { store, fetcher: site.fetcher, log: (l) => logs.push(l) });
  expect(await store.keys('journal/detail/')).toEqual([]);
  expect(logs[0]).toContain('shows another request');
});
