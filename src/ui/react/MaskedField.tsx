import { useState } from 'react';
import { t } from '../../app/i18n';

// Settings values like twitter and youtube: hidden behind dots, 👁 shows and hides, 📋 copies without showing
// (✅ for a moment after copying). Editing happens in the shown state; focusing the dots shows the value
export const iconButton = 'inline-flex size-7 flex-none items-center justify-center rounded-md border border-slate-300 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700';
const input = 'block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900';

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// the 👁 and 📋 pair, also used next to the spreadsheet link
export function RevealCopy({ label, value, shown, onToggle }: { label: string; value: string; shown: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { if (await copyText(value)) { setCopied(true); setTimeout(() => setCopied(false), 1200); } };
  return (
    <span className="flex items-center gap-1">
      <button type="button" className={iconButton} title={shown ? t('Hide {label}', { label }) : t('Show {label}', { label })} onClick={onToggle}>{shown ? '🙈' : '👁'}</button>
      <button type="button" className={iconButton} title={t('Copy {label}', { label })} disabled={!value} onClick={() => { void copy(); }}>{copied ? '✅' : '📋'}</button>
    </span>
  );
}

export function MaskedField(p: { label: string; value: string; mask: (v: string) => string; placeholder: string; onChange: (v: string) => void; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{p.label}</span>
        <RevealCopy label={p.label} value={p.value} shown={show} onToggle={() => setShow((s) => !s)} />
      </div>
      {show
        ? <input className={input} value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} autoComplete="off" spellCheck={false} />
        : <input className={input} value={p.value ? p.mask(p.value) : ''} onFocus={() => setShow(true)} onChange={() => { /* editing happens in the shown state */ }} placeholder={p.placeholder} readOnly />}
      {p.hint && <div className="mt-1 text-[10px] text-slate-400">{p.hint}</div>}
    </div>
  );
}
