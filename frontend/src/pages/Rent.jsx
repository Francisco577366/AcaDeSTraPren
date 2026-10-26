import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rentThunks } from '../store/slices/resourceSlices';
import { resourceActions } from '../store';
import { pushToast } from '../store/slices/uiSlice';
import { fetchOverview } from '../store/slices/dashboardSlice';
import { LABELS, money, bs, date, MONTHS } from '../utils/format';
import {
  optionsFrom, Modal, Badge, StatCard, Field, Input, Select, ErrorBanner,
} from '../components/ui';
import { IconMoney, IconBan, IconWallet } from '../components/Icons';
import ResourcePage from '../components/ResourcePage';

const statusOptions = optionsFrom(LABELS.paymentStatus);
const methodOptions = optionsFrom(LABELS.method);
const monthOptions = MONTHS.map((m, i) => ({ value: i + 1, label: m }));
const currencyOptions = [
  { value: 'USD', label: 'Dolares' },
  { value: 'VES', label: 'Bolivares' },
];

const today = new Date();

/** El alquiler puede pactarse en cualquiera de las dos monedas. */
const amountIn = (value, currency) => (currency === 'VES' ? bs(value) : money(value));

export default function Rent() {
  const dispatch = useDispatch();
  const summary = useSelector((s) => s.rent.summary);
  const saving = useSelector((s) => s.rent.saving);
  const { baseRent, rentCurrency } = useSelector((s) => s.options.settings);

  const [settleFor, setSettleFor] = useState(null);
  const [settleForm, setSettleForm] = useState({ amount: '', method: 'transferencia', reference: '' });
  const [settleError, setSettleError] = useState(null);
  const [voidFor, setVoidFor] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const { month, year } = useSelector((s) => s.period);
  const [genForm, setGenForm] = useState({
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    amount: baseRent || '',
    currency: rentCurrency || 'USD',
    landlord: '',
  });
  const [genError, setGenError] = useState(null);

  const refreshSummary = () => dispatch(rentThunks.fetchRentSummary({ year: today.getFullYear() }));

  useEffect(() => {
    refreshSummary();
  }, [dispatch]);

  const openSettle = (row) => {
    setSettleFor(row);
    setSettleForm({
      amount: String(row.balance ?? ''),
      method: row.method || 'transferencia',
      reference: '',
    });
    setSettleError(null);
  };

  const submitSettle = async (e) => {
    e.preventDefault();
    const res = await dispatch(rentThunks.settleRent({ id: settleFor.id, ...settleForm }));
    if (res.error) {
      setSettleError(res.payload || 'No se pudo registrar el pago');
      return;
    }
    dispatch(pushToast('Pago registrado'));
    refreshSummary();
    dispatch(fetchOverview());
    setSettleFor(null);
  };

  const submitVoid = async () => {
    const res = await dispatch(rentThunks.voidRent({ id: voidFor.id, reason: 'Anulado desde el panel' }));
    dispatch(pushToast(res.error ? { message: res.payload, type: 'error' } : 'Recibo anulado'));
    refreshSummary();
    dispatch(fetchOverview());
    setVoidFor(null);
  };

  const submitGenerate = async (e) => {
    e.preventDefault();
    const res = await dispatch(rentThunks.generateRent(genForm));
    if (res.error) {
      setGenError(res.payload || 'No se pudo emitir el alquiler');
      return;
    }
    dispatch(pushToast(res.payload.message));
    setGenOpen(false);
    refreshSummary();
    dispatch(fetchOverview());
  };

  const columns = [
    {
      key: 'receiptNumber',
      header: 'Recibo',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.receiptNumber || `#${r.id}`}</strong>
          <small>{r.landlord || 'Sin propietario'}</small>
        </div>
      ),
    },
    {
      key: 'concept',
      header: 'Concepto',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.concept}</span>
          <small>{r.periodLabel || '-'}</small>
        </div>
      ),
    },
    {
      key: 'dueDate',
      header: 'Vence',
      render: (r) => (
        <div className="cell-stack">
          <span>{date(r.dueDate)}</span>
          {r.paymentDate && <small>Pagado {date(r.paymentDate)}</small>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'right',
      render: (r) => <strong>{amountIn(r.amount, r.currency)}</strong>,
    },
    {
      key: 'paidAmount',
      header: 'Pagado',
      align: 'right',
      render: (r) => amountIn(r.paidAmount, r.currency),
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      render: (r) => (
        <strong className={r.balance > 0 ? 'text-danger' : 'text-success'}>
          {amountIn(r.balance, r.currency)}
        </strong>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      align: 'center',
      render: (r) => <Badge value={r.status} group="paymentStatus" />,
    },
  ];

  const formFields = [
    { name: 'concept', label: 'Concepto', required: true, span: 2, placeholder: 'Alquiler de septiembre' },
    { name: 'landlord', label: 'Propietario', span: 2 },
    { name: 'amount', label: 'Monto', type: 'number', defaultValue: baseRent || 0, required: true },
    {
      name: 'currency',
      label: 'Moneda',
      type: 'select',
      options: currencyOptions,
      defaultValue: rentCurrency || 'USD',
      placeholder: null,
    },
    {
      name: 'periodMonth',
      label: 'Mes',
      type: 'select',
      options: monthOptions,
      defaultValue: today.getMonth() + 1,
    },
    { name: 'periodYear', label: 'Anio', type: 'number', step: '1', defaultValue: today.getFullYear() },
    { name: 'dueDate', label: 'Fecha limite', type: 'date' },
    { name: 'paidAmount', label: 'Monto pagado', type: 'number', defaultValue: 0 },
    {
      name: 'method',
      label: 'Metodo',
      type: 'select',
      options: methodOptions,
      defaultValue: 'transferencia',
      placeholder: null,
    },
    { name: 'paymentDate', label: 'Fecha de pago', type: 'date' },
    { name: 'reference', label: 'Referencia', span: 2 },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];

  // Los totales del resumen vienen separados por moneda para no mezclarlos.
  const totalsBy = (predicate) =>
    (summary?.byStatus || []).filter(predicate).reduce(
      (acc, r) => {
        acc[r.currency] = acc[r.currency] || { total: 0, paid: 0, balance: 0, count: 0 };
        acc[r.currency].total += r.total;
        acc[r.currency].paid += r.paid;
        acc[r.currency].balance += r.balance;
        acc[r.currency].count += r.count;
        return acc;
      },
      {}
    );

  const show = (totals, field) => {
    const parts = Object.entries(totals)
      .filter(([, v]) => v[field] > 0)
      .map(([currency, v]) => amountIn(v[field], currency));
    return parts.length ? parts.join(' + ') : amountIn(0, rentCurrency || 'USD');
  };

  const paidTotals = totalsBy((r) => r.status !== 'anulado');
  const dueTotals = totalsBy((r) => ['pendiente', 'parcial', 'vencido'].includes(r.status));
  const overdueCount = (summary?.byStatus || [])
    .filter((r) => r.status === 'vencido')
    .reduce((a, r) => a + r.count, 0);

  return (
    <>
      <ResourcePage
        title="Alquiler"
        subtitle="Lo que cuesta el local y como va su pago"
        sliceName="rent"
        thunks={rentThunks}
        actions={resourceActions.rent}
        columns={columns}
        entityName="alquiler"
        entityNamePlural="alquileres"
        createLabel="Registrar alquiler"
        searchPlaceholder="Buscar por recibo, concepto o propietario..."
        formSize="lg"
        filters={[
          { key: 'status', label: 'Todos los estados', options: statusOptions },
          { key: 'periodMonth', label: 'Todos los meses', options: monthOptions },
          { key: 'currency', label: 'Todas las monedas', options: currencyOptions },
        ]}
        formFields={formFields}
        toolbarExtra={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setGenError(null);
              setGenForm((f) => ({ ...f, month, year }));
              setGenOpen(true);
            }}
          >
            <IconWallet size={16} /> Emitir el del mes
          </button>
        }
        rowActions={(row) =>
          row.status !== 'anulado' && (
            <>
              {row.balance > 0 && (
                <button
                  type="button"
                  className="icon-btn icon-btn-success"
                  title="Registrar pago"
                  onClick={() => openSettle(row)}
                >
                  <IconMoney size={16} />
                </button>
              )}
              <button
                type="button"
                className="icon-btn icon-btn-warning"
                title="Anular"
                onClick={() => setVoidFor(row)}
              >
                <IconBan size={16} />
              </button>
            </>
          )
        }
        headerExtra={
          summary && (
            <div className="stat-grid stat-grid-sm">
              <StatCard label="Pagado del anio" value={show(paidTotals, 'paid')} tone="success" />
              <StatCard
                label="Por pagar"
                value={show(dueTotals, 'balance')}
                tone={Object.keys(dueTotals).length ? 'warning' : 'success'}
              />
              <StatCard
                label="Meses vencidos"
                value={overdueCount}
                tone={overdueCount > 0 ? 'danger' : 'default'}
              />
            </div>
          )
        }
      />

      <Modal
        open={Boolean(settleFor)}
        size="sm"
        title="Registrar pago del alquiler"
        onClose={() => setSettleFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSettleFor(null)}>
              Cancelar
            </button>
            <button type="submit" form="settle-rent-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </>
        }
      >
        <form id="settle-rent-form" onSubmit={submitSettle} className="form-grid">
          <ErrorBanner message={settleError} onClose={() => setSettleError(null)} />
          <p className="muted field-span-2">
            {settleFor?.concept} - saldo{' '}
            <strong className="text-warning">
              {amountIn(settleFor?.balance, settleFor?.currency)}
            </strong>
          </p>
          <Field label="Monto" required span={2}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={settleFor?.balance}
              required
              value={settleForm.amount}
              onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Metodo">
            <Select
              value={settleForm.method}
              options={methodOptions}
              placeholder={null}
              onChange={(e) => setSettleForm({ ...settleForm, method: e.target.value })}
            />
          </Field>
          <Field label="Referencia">
            <Input
              value={settleForm.reference}
              onChange={(e) => setSettleForm({ ...settleForm, reference: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(voidFor)}
        size="sm"
        title="Anular recibo"
        onClose={() => setVoidFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setVoidFor(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={submitVoid} disabled={saving}>
              Anular
            </button>
          </>
        }
      >
        <p className="confirm-text">
          El recibo <strong>{voidFor?.receiptNumber}</strong> quedara anulado y dejara de contar en
          el resultado del mes.
        </p>
      </Modal>

      <Modal
        open={genOpen}
        size="sm"
        title="Emitir el alquiler del mes"
        onClose={() => setGenOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setGenOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="gen-rent-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Emitiendo...' : 'Emitir'}
            </button>
          </>
        }
      >
        <form id="gen-rent-form" onSubmit={submitGenerate} className="form-grid">
          <ErrorBanner message={genError} onClose={() => setGenError(null)} />
          <p className="muted field-span-2">
            Crea el recibo del periodo con el monto habitual. Si sueles pagar siempre lo mismo,
            fijalo en BASE_RENT y viene propuesto.
          </p>
          <Field label="Mes">
            <Select
              value={genForm.month}
              options={monthOptions}
              placeholder={null}
              onChange={(e) => setGenForm({ ...genForm, month: Number(e.target.value) })}
            />
          </Field>
          <Field label="Anio">
            <Input
              type="number"
              step="1"
              value={genForm.year}
              onChange={(e) => setGenForm({ ...genForm, year: Number(e.target.value) })}
            />
          </Field>
          <Field label="Monto" required>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={genForm.amount}
              onChange={(e) => setGenForm({ ...genForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Moneda">
            <Select
              value={genForm.currency}
              options={currencyOptions}
              placeholder={null}
              onChange={(e) => setGenForm({ ...genForm, currency: e.target.value })}
            />
          </Field>
          <Field label="Propietario" span={2}>
            <Input
              value={genForm.landlord}
              onChange={(e) => setGenForm({ ...genForm, landlord: e.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
