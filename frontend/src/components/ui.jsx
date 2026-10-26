import { useEffect } from 'react';
import { STATUS_TONE, label as labelOf } from '../utils/format';
import { IconClose, IconAlert, IconSearch } from './Icons';

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

export function Badge({ value, group, tone }) {
  const resolved = tone || STATUS_TONE[value] || 'muted';
  return <span className={`badge badge-${resolved}`}>{group ? labelOf(group, value) : value}</span>;
}

/* ------------------------------------------------------------------ */
/* Estados de carga y vacio                                            */
/* ------------------------------------------------------------------ */

export function Loader({ text = 'Cargando...' }) {
  return (
    <div className="loader">
      <span className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function EmptyState({ title = 'Sin registros', hint, action }) {
  return (
    <div className="empty-state">
      <IconSearch size={32} />
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="error-banner">
      <IconAlert size={18} />
      <span>{message}</span>
      {onClose && (
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
          <IconClose size={16} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <IconClose size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmText = 'Confirmar', tone = 'danger', onConfirm, onCancel, busy }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className={`btn btn-${tone}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Procesando...' : confirmText}
          </button>
        </>
      }
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Campos de formulario                                                */
/* ------------------------------------------------------------------ */

export function Field({ label, error, hint, required, children, span }) {
  return (
    <div className={`field ${span ? `field-span-${span}` : ''}`}>
      <label className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && !error && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}

export function Input({ ...props }) {
  return <input className="input" {...props} />;
}

export function Select({ options = [], placeholder = 'Seleccionar...', ...props }) {
  return (
    <select className="input" {...props}>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function Textarea({ ...props }) {
  return <textarea className="input textarea" rows={3} {...props} />;
}

/** Convierte un objeto de etiquetas ({clave: texto}) en options para Select. */
export const optionsFrom = (dict) =>
  Object.entries(dict).map(([value, label]) => ({ value, label }));

/* ------------------------------------------------------------------ */
/* Tarjetas de indicadores                                             */
/* ------------------------------------------------------------------ */

export function StatCard({ label, value, hint, tone = 'default', valueTone, icon, action }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      {icon && <div className="stat-icon">{icon}</div>}
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        {/* valueTone pinta la cifra: sirve para leer de un vistazo si se debe. */}
        <strong className={valueTone ? `stat-value text-${valueTone}` : 'stat-value'}>{value}</strong>
        {hint && <span className="stat-hint">{hint}</span>}
        {action && <span className="stat-action">{action}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paginacion                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  const { page, totalPages, total } = meta;

  const pages = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  for (let i = from; i <= to; i += 1) pages.push(i);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {total} registro{total === 1 ? '' : 's'} - pagina {page} de {totalPages}
      </span>
      <div className="pagination-controls">
        <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        {from > 1 && (
          <button type="button" className="page-btn" onClick={() => onPage(1)}>
            1
          </button>
        )}
        {from > 2 && <span className="page-dots">...</span>}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`page-btn ${p === page ? 'is-active' : ''}`}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        {to < totalPages - 1 && <span className="page-dots">...</span>}
        {to < totalPages && (
          <button type="button" className="page-btn" onClick={() => onPage(totalPages)}>
            {totalPages}
          </button>
        )}
        <button
          type="button"
          className="page-btn"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla                                                               */
/* ------------------------------------------------------------------ */

export function DataTable({ columns, rows, loading, empty, rowKey = (r) => r.id, onRowClick }) {
  if (loading) return <Loader />;
  if (!rows?.length) return empty || <EmptyState />;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={[col.align && `align-${col.align}`, col.className].filter(Boolean).join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'is-clickable' : ''}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[col.align && `align-${col.align}`, col.className].filter(Boolean).join(' ')}
                  data-label={col.header}
                >
                  {col.render ? col.render(row) : row[col.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grafico de barras minimalista                                       */
/* ------------------------------------------------------------------ */

export function BarChart({ data, keys, colors, height = 220, formatValue = (v) => v }) {
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => Number(d[k] || 0))));
  const barGroupWidth = 100 / Math.max(1, data.length);

  return (
    <div className="chart" style={{ height }}>
      <div className="chart-grid">
        {[1, 0.75, 0.5, 0.25, 0].map((r) => (
          <div key={r} className="chart-line">
            <span>{formatValue(Math.round(max * r))}</span>
          </div>
        ))}
      </div>
      <div className="chart-bars">
        {data.map((d) => (
          <div className="chart-group" key={d.label} style={{ width: `${barGroupWidth}%` }}>
            <div className="chart-group-bars">
              {keys.map((k, i) => (
                <div
                  key={k}
                  className="chart-bar"
                  style={{
                    height: `${(Number(d[k] || 0) / max) * 100}%`,
                    background: colors[i],
                  }}
                  title={`${k}: ${formatValue(d[k])}`}
                />
              ))}
            </div>
            <span className="chart-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label} className="legend-item">
          <i style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
