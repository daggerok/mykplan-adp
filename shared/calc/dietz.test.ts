/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { modifiedDietz } from './dietz';

describe('modifiedDietz', () => {
  test('mid-period flow weighs half: (1200 - 1000 - 100) / (1000 + 0.5 x 100)', () => {
    // 2024-06-01 .. 2024-07-01 = 30 days, flow on day 15 -> w = 15 / 30
    expect(modifiedDietz(100000, 120000, [{ date: '2024-06-16', amount: 10000 }], '2024-06-01', '2024-07-01')).toBeCloseTo(10000 / 105000, 12);
  });
  test('a flow on the first day counts fully, on the last day not at all, outside is ignored', () => {
    const r = modifiedDietz(100000, 125000, [
      { date: '2024-06-01', amount: 10000 },
      { date: '2024-07-01', amount: 5000 },
      { date: '2024-08-01', amount: 99999 },
    ], '2024-06-01', '2024-07-01');
    expect(r).toBeCloseTo((125000 - 100000 - 15000) / 110000, 12);
  });
  test('no flows = simple return; nothing invested -> null', () => {
    expect(modifiedDietz(1000, 1100, [], '2024-01-01', '2024-01-31')).toBeCloseTo(0.1, 12);
    expect(modifiedDietz(0, 500, [{ date: '2024-01-31', amount: 500 }], '2024-01-01', '2024-01-31')).toBeNull();
  });
});
