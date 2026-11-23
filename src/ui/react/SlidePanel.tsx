import { t } from '../../app/i18n';

// A panel that slides down under the toolbar and back up (twitter's settings and log panels)
export function SlidePanel({ open, title, onClose, id, children }: { open: boolean; title: string; onClose: () => void; id: string; children: React.ReactNode }) {
  return (
    // the gap above comes with the open panel only (twitter: 'open mb-4'), so a closed panel leaves no extra space
    <div id={id} className={`slide-wrap shrink-0 ${open ? 'open mt-4 lg:mt-6' : ''}`} aria-hidden={!open}>
      <div className="slide-inner">
        <section className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button type="button" className="tb" title={t('Close')} onClick={onClose}>✕</button>
          </div>
          <div className="p-4">{children}</div>
        </section>
      </div>
    </div>
  );
}
