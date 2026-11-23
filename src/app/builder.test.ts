/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { sampleDataset } from '../../shared/sample';
import { PRESETS, buildSeries, fundPrices, loadLayouts } from './builder';
import { derive } from './derive';

const ds = sampleDataset('2024-12-31');
const d = derive(ds);
const spy = d.nav.map((p, i) => ({ date: p.date, value: 400 + i }));

test('Portfolio vs S&P: both rebased to 0 % on the first day, drawdowns in a second pane', () => {
  const s = buildSeries(PRESETS[0]!, d, ds, { SPY: spy });
  expect(s.filter((x) => x.pane === 0).map((x) => x.name)).toEqual(['Portfolio', 'SPY']);
  s.filter((x) => x.pane === 0).forEach((x) => expect(x.data[0]!.value).toBeCloseTo(0, 9));
  expect(s.filter((x) => x.pane === 1).map((x) => x.name)).toEqual(['Portfolio drawdown', 'SPY drawdown']);
  s.filter((x) => x.pane === 1).forEach((x) => x.data.forEach((p) => expect(p.value).toBeLessThanOrEqual(0)));
});

test('Buy the dip: three panes, contributions with the % step line on its own scale', () => {
  const s = buildSeries(PRESETS[1]!, d, ds, { SPY: spy });
  expect(Array.from(new Set(s.map((x) => x.pane)))).toEqual([0, 1, 2]);
  const step = s.find((x) => x.kind === 'step')!;
  expect(step).toMatchObject({ pane: 1, scale: 'pct' });
  // the sample ends 2024-12-31; its 2025-01-10 change to 8 % is past the data and dropped
  expect(step.data[step.data.length - 1]).toEqual({ date: d.nav[d.nav.length - 1]!.date, value: 6 });
  expect(step.data.every((p) => p.date <= d.nav[d.nav.length - 1]!.date)).toBe(true);
  const later = buildSeries({ ...PRESETS[1]!, from: '2024-06-03' }, d, ds, { SPY: spy }).find((x) => x.kind === 'step')!;
  expect(later.data[0]).toEqual({ date: '2024-06-03', value: 6 });
  expect(s.find((x) => x.name === 'EE + ER')!.data.length).toBe(d.paychecks.length);
});

test('a start day cuts every pane; a missing benchmark is an empty line; fund prices', () => {
  const s = buildSeries({ ...PRESETS[0]!, from: '2024-06-03', main: ['nav', 'bench:QQQ'] }, d, ds, {});
  expect(s[0]!.data[0]!.date >= '2024-06-03').toBe(true);
  expect(s[1]!.data).toEqual([]);
  expect(fundPrices(ds, ds.dailyFunds[0]!.fund).length).toBeGreaterThan(100);
  expect(loadLayouts(undefined)).toEqual(PRESETS);
});
