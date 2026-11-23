export const Card = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40" title={hint}>
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
  </div>
);
export const Cards = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>;
export const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-4 text-sm font-semibold text-slate-600 dark:text-slate-300">{children}</h3>;
