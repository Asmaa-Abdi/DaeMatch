import type { ReactNode } from 'react';

export function MetricCard({ label, value, note, icon }: { label: string; value: string | number; note?: string; icon: ReactNode }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span></div>
      <strong className="metric-value">{value}</strong>
      {note && <span className="metric-note">{note}</span>}
    </article>
  );
}
