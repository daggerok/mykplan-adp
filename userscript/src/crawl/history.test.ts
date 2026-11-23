/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import type { Transaction } from '../../../shared/model';
import { backdatedFrom, firstActivity, keyEnd, staleKeys } from './history';

const tx = (id: string, activityDate: string): Transaction => ({ id, activityDate, fund: 'F', type: 'contribution', rawType: 'Contribution', amount: 100, origin: 'txPrint' });
const year = { from: '2026-05-12', to: '2026-11-20' };

test('keyEnd reads day and window keys', () => {
  expect(keyEnd('tx/day/2026-06-12.html')).toBe('2026-06-12');
  expect(keyEnd('tx/source/month/2026-06-01_2026-06-30.html')).toBe('2026-06-30');
  expect(keyEnd('journal/2026-11-21.html')).toBeNull();
});

test('firstActivity is the earliest transaction', () => {
  expect(firstActivity([tx('a', '2024-03-14'), tx('b', '2024-03-05')])).toBe('2024-03-05');
  expect(firstActivity([])).toBeNull();
});

test('the same transactions in the year window and the saved months: nothing changed', () => {
  const months = [
    { key: 'm5', from: '2026-05-01', to: '2026-05-31', tx: [tx('early', '2026-05-02'), tx('a', '2026-05-15')] },
    { key: 'm6', from: '2026-06-01', to: '2026-06-30', tx: [tx('b', '2026-06-12')] },
  ];
  // "early" is before the year window: the partly covered May is compared only from May 12
  expect(backdatedFrom({ ...year, tx: [tx('a', '2026-05-15'), tx('b', '2026-06-12'), tx('c', '2026-11-13')] }, months)).toBeNull();
});

test('a transaction posted later with an earlier date is found, in a closed month or in an old partial page', () => {
  const months = [
    { key: 'm6', from: '2026-06-01', to: '2026-06-30', tx: [tx('b', '2026-06-12')] },
    { key: 'm7', from: '2026-07-01', to: '2026-07-31', tx: [tx('d', '2026-07-17')] },
    { key: 'm11', from: '2026-11-01', to: '2026-11-13', tx: [] },
  ];
  expect(backdatedFrom({ ...year, tx: [tx('b', '2026-06-12'), tx('late', '2026-07-03'), tx('d', '2026-07-17')] }, months)).toBe('2026-07-03');
  // a row that disappeared counts too, and the earliest difference wins
  expect(backdatedFrom({ ...year, tx: [tx('d', '2026-07-17'), tx('n', '2026-11-10')] }, months)).toBe('2026-06-12');
  // a twin row (two equal paychecks) is counted, not only seen
  expect(backdatedFrom({ ...year, tx: [tx('b', '2026-06-12'), tx('b', '2026-06-12'), tx('d', '2026-07-17')] }, months)).toBe('2026-06-12');
});

test('stale pages: months ending on or after the date and every day from it', () => {
  const keys = ['tx/fund/month/2026-06-01_2026-06-30.html', 'tx/source/month/2026-07-01_2026-07-31.html', 'tx/fund/month/2026-07-01_2026-07-31.html',
    'tx/day/2026-07-02.html', 'tx/day/2026-07-03.html', 'tx/day/2026-11-20.html', 'tx/fund/year/2025-05-12_2026-05-11.html', 'journal/2026-11-21.html'];
  expect(staleKeys(keys, '2026-07-03')).toEqual(['tx/source/month/2026-07-01_2026-07-31.html', 'tx/fund/month/2026-07-01_2026-07-31.html', 'tx/day/2026-07-03.html', 'tx/day/2026-11-20.html']);
});
