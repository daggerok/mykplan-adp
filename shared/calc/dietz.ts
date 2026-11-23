/// <reference lib="esnext" />
// Modified Dietz return of one period (the plan section 6):
//   R = (End - Begin - F) / (Begin + sum(w_i * F_i)),  w_i = (CD - D_i) / CD
// CD = calendar days from `from` to `to`, D_i = days from `from` to the flow date. A flow on `from` counts
// fully (w = 1), a flow on `to` not at all (w = 0). Flows outside [from, to] are ignored
import { daysBetween } from '../dates';

export interface Flow {
  date: string;
  amount: number;
}

// null when the weighted capital is not positive (nothing invested, no return to speak of)
export function modifiedDietz(begin: number, end: number, flows: Flow[], from: string, to: string): number | null {
  const cd = daysBetween(from, to);
  let total = 0;
  let weighted = 0;
  for (const f of flows) {
    if (f.date < from || f.date > to) continue;
    total += f.amount;
    weighted += cd > 0 ? ((cd - daysBetween(from, f.date)) / cd) * f.amount : 0;
  }
  const capital = begin + weighted;
  if (capital <= 0) return null;
  return (end - begin - total) / capital;
}
