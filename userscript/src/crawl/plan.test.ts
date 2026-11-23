/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { HISTORY_START, SNAPSHOT_PAGES, halfYearWindows, planSteps, tradingDays, yearWindows, type Step } from './plan';

describe('windows', () => {
  test('12-month windows from the history start, the last one clipped', () => {
    expect(yearWindows('2023-05-12', '2026-11-20')).toEqual([
      { from: '2023-05-12', to: '2024-05-11' },
      { from: '2024-05-12', to: '2025-05-11' },
      { from: '2025-05-12', to: '2026-05-11' },
      { from: '2026-05-12', to: '2026-11-20' },
    ]);
  });
  test('half-year windows for Quicken, never longer than 6 months', () => {
    expect(halfYearWindows('2023-05-12', '2024-06-01')).toEqual([
      { from: '2023-05-12', to: '2023-11-11' },
      { from: '2023-11-12', to: '2024-05-11' },
      { from: '2024-05-12', to: '2024-06-01' },
    ]);
  });
  test('trading days skip weekends', () => {
    expect(tradingDays('2026-11-13', '2026-11-17')).toEqual(['2026-11-13', '2026-11-16', '2026-11-17']);
  });
});

describe('planSteps', () => {
  const base = { lastPriceDay: '2026-11-20', today: '2026-11-21', statementQuarters: ['2023-09-30', '2026-09-30'] };
  const count = (steps: Step[], kind: Step['kind']) => steps.filter((s) => s.kind === kind).length;

  test('first full run asks for everything', () => {
    const steps = planSteps({ ...base, mode: 'full', saved: () => false });
    expect(steps[0]!.kind).toBe('highlights');
    expect(count(steps, 'snapshot')).toBe(SNAPSHOT_PAGES.length);
    expect(count(steps, 'journal')).toBe(1);
    expect(count(steps, 'txWindow')).toBe(4 + 43 * 2);
    expect(count(steps, 'statement')).toBe(2);
    expect(count(steps, 'qfx')).toBe(halfYearWindows(HISTORY_START, '2026-11-20').length);
    expect(count(steps, 'txDay')).toBe(tradingDays(HISTORY_START, '2026-11-20').length);
    expect(steps[steps.length - 1]!.kind).toBe('txDay');
    expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length);
  });

  test('with everything saved only the open parts are asked again', () => {
    const steps = planSteps({ ...base, mode: 'sync', saved: () => true });
    const windows = steps.filter((s): s is Extract<Step, { kind: 'txWindow' }> => s.kind === 'txWindow');
    // the current year window and November in both views
    expect(windows.map((w) => `${w.view} ${w.from} ${w.to}`)).toEqual([
      'fund 2026-05-12 2026-11-20',
      'fund 2026-11-01 2026-11-20',
      'source 2026-11-01 2026-11-20',
    ]);
    expect(count(steps, 'statement')).toBe(0);
    expect(count(steps, 'txDay')).toBe(0);
    expect(count(steps, 'qfx')).toBe(2); // half-year windows ending 2026-11-11 and 2026-11-20 are still open in November
    expect(count(steps, 'highlights') + count(steps, 'snapshot') + count(steps, 'journal')).toBe(1 + SNAPSHOT_PAGES.length + 1);
  });

  test('nothing before the first transaction: those days and months are empty on the site', () => {
    const steps = planSteps({ ...base, mode: 'full', saved: () => false, firstDay: '2023-08-01' });
    const days = steps.filter((s) => s.kind === 'txDay').map((s) => s.key);
    expect(days[0]).toBe('tx/day/2023-08-01.html');
    expect(days).toHaveLength(tradingDays('2023-08-01', '2026-11-20').length);
    // May to July 2023 go away in both views, August stays; years and Quicken are unchanged
    expect(count(steps, 'txWindow')).toBe(4 + 40 * 2);
    expect(count(steps, 'qfx')).toBe(halfYearWindows(HISTORY_START, '2026-11-20').length);
  });

  test('sync after a few days takes only the new days', () => {
    const saved = (k: string) => !(k === 'tx/day/2026-11-20.html' || k === 'tx/day/2026-11-19.html');
    const days = planSteps({ ...base, mode: 'sync', saved }).filter((s) => s.kind === 'txDay').map((s) => s.key);
    expect(days).toEqual(['tx/day/2026-11-19.html', 'tx/day/2026-11-20.html']);
  });
});
