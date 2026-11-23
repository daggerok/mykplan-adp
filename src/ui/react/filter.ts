/// <reference lib="esnext" />
// Row filter of the tables: words AND-ed, "a,b" is OR inside one word, "!x" is NOT, "=x" exact cell, "^x" starts.
// A small subset of the youtube filter syntax (the plan section 7), matched against every cell of the row
export function rowMatches(cells: string[], query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const lower = cells.map((c) => c.toLowerCase());
  return words.every((w) => {
    const neg = w.startsWith('!');
    const body = neg ? w.slice(1) : w;
    if (!body) return true;
    const hit = body.split(',').filter(Boolean).some((alt) =>
      alt.startsWith('=') ? lower.some((c) => c === alt.slice(1)) : alt.startsWith('^') ? lower.some((c) => c.startsWith(alt.slice(1))) : lower.some((c) => c.includes(alt)));
    return neg ? !hit : hit;
  });
}

export function toCsv(head: string[], rows: string[][]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\n');
}
