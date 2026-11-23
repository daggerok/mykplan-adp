/// <reference lib="esnext" />
// Money-weighted return (XIRR, the plan section 6): the annual rate r with
//   sum(a_i / (1 + r)^(t_i / 365)) = 0,  t_i = days from the first flow
// Contributions are negative, the final value positive. Newton from 10 %, bisection when Newton fails
import { daysBetween } from '../dates';
import { Flow } from './dietz';

function npv(flows: Array<{ t: number; a: number }>, r: number): number {
  let s = 0;
  for (const f of flows) s += f.a / Math.pow(1 + r, f.t);
  return s;
}

function dnpv(flows: Array<{ t: number; a: number }>, r: number): number {
  let s = 0;
  for (const f of flows) s -= (f.t * f.a) / Math.pow(1 + r, f.t + 1);
  return s;
}

// null when every flow has the same sign (no rate solves it) or no root is found
export function xirr(flows: Flow[], guess = 0.1): number | null {
  const live = flows.filter((f) => f.amount !== 0);
  if (!live.some((f) => f.amount > 0) || !live.some((f) => f.amount < 0)) return null;
  const first = live.reduce((m, f) => (f.date < m ? f.date : m), live[0]!.date);
  const fs = live.map((f) => ({ t: daysBetween(first, f.date) / 365, a: f.amount }));
  const scale = live.reduce((m, f) => Math.max(m, Math.abs(f.amount)), 0);
  const tol = 1e-10 * scale;

  let r = guess;
  for (let i = 0; i < 100; i++) {
    const v = npv(fs, r);
    if (Math.abs(v) < tol) return r;
    const d = dnpv(fs, r);
    if (d === 0 || !isFinite(d)) break;
    const next = r - v / d;
    if (!isFinite(next) || next <= -1) break;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }

  // Bisection: bracket a sign change between -99.99 % and a growing upper bound
  let lo = -0.9999;
  let hi = 1;
  const flo = npv(fs, lo);
  while (npv(fs, hi) * flo > 0 && hi < 1e6) hi *= 2;
  if (npv(fs, hi) * flo > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(fs, mid);
    if (Math.abs(v) < tol || hi - lo < 1e-12) return mid;
    if (v * flo > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
