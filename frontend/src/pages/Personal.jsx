import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { personalThunks } from '../store/slices/resourceSlices';
import { resourceActions } from '../store';
import { fetchOverview } from '../store/slices/dashboardSlice';
import { pushToast } from '../store/slices/uiSlice';
import { LABELS, money, bs, date, label, MONTHS } from '../utils/format';
import { optionsFrom, Badge, StatCard, Modal, ErrorBanner, Loader, EmptyState } from '../components/ui';
import { IconRefresh } from '../components/Icons';
import ResourcePage from '../components/ResourcePage';

const categoryOptions = optionsFrom(LABELS.personalCategory);
const methodOptions = optionsFrom(LABELS.method);
const currencyOptions = [
  { value: 'USD', label: 'Dolares' },
  { value: 'VES', label: 'Bolivares' },
];

const today = new Date();

/** Cada retiro se muestra en la moneda de la que salio. */
const amountIn = (value, currency) => (currency === 'VES' ? bs(value) : money(value));

export default function Personal() {
  const dispatch = useDispatch();
  const summary = useSelector((s) => s.personal.summary);
  const finance = useSelector((s) => s.dashboard.overview?.finance);
  const saving = useSelector((s) => s.personal.saving);
  const { month, year } = useSelector((s) => s.period);

  const [renewOpen, setRenewOpen] = useState(false);
  const [previo, setPrevio] = useState(null);
  const [elegidos, setElegidos] = useState([]);
  const [renewError, setRenewError] = useState(null);

  /** Abre la propuesta: lo del mes anterior, con lo ya repetido desmarcado. */
  const openRenew = async () => {
    setRenewError(null);
    setPrevio(null);
    setRenewOpen(true);
    const res = await dispatch(personalThunks.fetchPreviousPersonal({ month, year }));
    if (res.error) {
      setRenewError(res.payload || 'No se pudo consultar el mes anterior');
      return;
    }
    setPrevio(res.payload);
    setElegidos(res.payload.items.filter((i) => !i.alreadyRenewed).map((i) => i.id));
  };

  const toggle = (id) =>
    setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submitRenew = async (e) => {
    e.preventDefault();
    const res = await dispatch(personalThunks.renewPersonal({ ids: elegidos, month, year }));
    if (res.error) {
      setRenewError(res.payload || 'No se pudo renovar');
      return;
    }
    dispatch(pushToast(res.payload.message));
    dispatch(personalThunks.fetchPersonalSummary({ year }));
    dispatch(fetchOverview({ month, year }));
    setRenewOpen(false);
  };

  useEffect(() => {
    dispatch(personalThunks.fetchPersonalSummary({ year: today.getFullYear() }));
    // La ganancia del mes vive en el panel: de ahi sale cuanto queda.
    if (!finance) dispatch(fetchOverview());
  }, [dispatch]);

  const columns = [
    {
      key: 'paymentDate',
      header: 'Fecha',
      render: (r) => (
        <div className="cell-stack">
          <span>{date(r.paymentDate)}</span>
          <small>{r.receiptNumber || `#${r.id}`}</small>
        </div>
      ),
    },
    {
      key: 'concept',
      header: 'Concepto',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.concept}</span>
          <small>{label('method', r.method)}</small>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      align: 'center',
      render: (r) => <Badge value={r.category} group="personalCategory" tone="info" />,
    },
    {
      key: 'reference',
      header: 'Referencia',
      render: (r) =>
        r.reference ? <span className="ref-text">{r.reference}</span> : <span className="muted">-</span>,
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'right',
      render: (r) => <strong>{amountIn(r.amount, r.currency)}</strong>,
    },
  ];

  const formFields = [
    { name: 'concept', label: 'Concepto', required: true, span: 2, placeholder: 'Retiro para gastos' },
    {
      name: 'category',
      label: 'Categoria',
      type: 'select',
      options: categoryOptions,
      defaultValue: 'retiro',
      placeholder: null,
    },
    { name: 'paymentDate', label: 'Fecha', type: 'date', required: true },
    { name: 'amount', label: 'Monto', type: 'number', required: true },
    {
      name: 'currency',
      label: 'Moneda',
      type: 'select',
      options: currencyOptions,
      defaultValue: 'USD',
      placeholder: null,
      hint: 'De que caja salio el dinero',
    },
    {
      name: 'method',
      label: 'Metodo',
      type: 'select',
      options: methodOptions,
      defaultValue: 'efectivo',
      placeholder: null,
    },
    { name: 'reference', label: 'Referencia' },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];

  // Los totales llegan separados por moneda para no mezclarlos.
  const show = (rows) => {
    const parts = (rows || []).filter((r) => r.total > 0).map((r) => amountIn(r.total, r.currency));
    return parts.length ? parts.join(' + ') : money(0);
  };

  const delAnio = (summary?.byMonth || []).reduce((acc, r) => {
    acc[r.currency] = acc[r.currency] || { currency: r.currency, total: 0 };
    acc[r.currency].total += r.total;
    return acc;
  }, {});

  const mesActual = MONTHS[today.getMonth()];

  return (
    <>
    <ResourcePage
      title="Pagos personales"
      subtitle="Lo que sale de la caja para el bolsillo, no para el negocio"
      sliceName="personal"
      thunks={personalThunks}
      actions={resourceActions.personal}
      columns={columns}
      entityName="pago personal"
      entityNamePlural="pagos personales"
      createLabel="Registrar retiro"
      searchPlaceholder="Buscar por concepto, recibo o referencia..."
      formSize="lg"
      filters={[
        { key: 'category', label: 'Todas las categorias', options: categoryOptions },
        { key: 'currency', label: 'Todas las monedas', options: currencyOptions },
      ]}
      formFields={formFields}
      toolbarExtra={
        <button type="button" className="btn btn-ghost" onClick={openRenew}>
          <IconRefresh size={16} /> Renovar los del mes anterior
        </button>
      }
      headerExtra={
        <div className="stat-grid stat-grid-sm">
          <StatCard
            label={`Retirado en ${mesActual}`}
            value={show(summary?.month)}
            hint={`${finance?.personalCount ?? 0} retiro(s) este mes`}
            tone="info"
          />
          <StatCard label="Retirado en el anio" value={show(Object.values(delAnio))} />
          {/* La ganancia del negocio no baja por esto: el retiro sale de ella. */}
          <StatCard
            label={`Ganancia de ${mesActual}`}
            value={money(finance?.profitMonth ?? 0)}
            hint="Del negocio, sin descontar retiros"
            tone="success"
          />
          <StatCard
            label="Queda de la ganancia"
            value={money(finance?.profitAfterPersonal ?? 0)}
            hint="Ganancia menos lo retirado"
            tone={(finance?.profitAfterPersonal ?? 0) >= 0 ? 'success' : 'danger'}
            valueTone={(finance?.profitAfterPersonal ?? 0) >= 0 ? 'success' : 'danger'}
          />
        </div>
      }
    />

      <Modal
        open={renewOpen}
        size="lg"
        title="Renovar los pagos del mes anterior"
        onClose={() => setRenewOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRenewOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="renew-form"
              className="btn btn-primary"
              disabled={saving || !elegidos.length}
            >
              {saving ? 'Renovando...' : `Renovar ${elegidos.length}`}
            </button>
          </>
        }
      >
        <form id="renew-form" onSubmit={submitRenew} className="form-grid">
          <ErrorBanner message={renewError} onClose={() => setRenewError(null)} />
          {!previo ? (
            <Loader text="Buscando el mes anterior..." />
          ) : !previo.items.length ? (
            <EmptyState
              title={`Sin pagos en ${previo.from.label}`}
              hint="No hay nada que renovar: registra el primero a mano."
            />
          ) : (
            <>
              <p className="muted field-span-2">
                Se copiaran de <strong>{previo.from.label}</strong> a{' '}
                <strong>{previo.to.label}</strong>, conservando el dia del mes. Desmarca lo que
                no se repita.
              </p>
              <div className="table-wrap field-span-2">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th className="align-center">Renovar</th>
                      <th>Concepto</th>
                      <th>Categoria</th>
                      <th>Dia</th>
                      <th className="align-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previo.items.map((i) => (
                      <tr key={i.id}>
                        <td data-label="Renovar" className="align-center">
                          <input
                            type="checkbox"
                            checked={elegidos.includes(i.id)}
                            onChange={() => toggle(i.id)}
                          />
                        </td>
                        <td data-label="Concepto">
                          <div className="cell-stack">
                            <strong>{i.concept}</strong>
                            {i.alreadyRenewed && (
                              <small className="text-warning">Ya existe uno igual este mes</small>
                            )}
                          </div>
                        </td>
                        <td data-label="Categoria">
                          <Badge value={i.category} group="personalCategory" tone="info" />
                        </td>
                        <td data-label="Dia">{date(i.paymentDate)}</td>
                        <td data-label="Monto" className="align-right">
                          <strong>{amountIn(i.amount, i.currency)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </form>
      </Modal>
    </>
  );
}
