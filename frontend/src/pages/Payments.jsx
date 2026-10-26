import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { paymentThunks } from '../store/slices/resourceSlices';
import { resourceActions } from '../store';
import { pushToast } from '../store/slices/uiSlice';
import { LABELS, money, date, MONTHS, label } from '../utils/format';
import {
  optionsFrom, Modal, Badge, StatCard, Field, Input, Select, ErrorBanner,
} from '../components/ui';
import { IconMoney, IconBan, IconRefresh, IconReceipt } from '../components/Icons';
import ResourcePage from '../components/ResourcePage';
import ExchangeRate from '../components/ExchangeRate';

const statusOptions = optionsFrom(LABELS.paymentStatus);
const conceptOptions = optionsFrom(LABELS.conceptType);
const methodOptions = optionsFrom(LABELS.method);
const monthOptions = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

const today = new Date();

export default function Payments() {
  const dispatch = useDispatch();
  const summary = useSelector((s) => s.payments.summary);
  const saving = useSelector((s) => s.payments.saving);
  const studentOptions = useSelector((s) =>
    s.options.students.map((st) => ({ value: st.id, label: st.fullName }))
  );

  const [settleFor, setSettleFor] = useState(null);
  const [settleForm, setSettleForm] = useState({ amount: '', method: 'efectivo', reference: '' });
  const [settleError, setSettleError] = useState(null);
  const [voidFor, setVoidFor] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [genOpen, setGenOpen] = useState(false);
  // Al abrir el generador se parte del mes de la cabecera.
  const openGenerate = () => {
    setGenForm((f) => ({ ...f, month, year }));
    setGenOpen(true);
  };
  const [genForm, setGenForm] = useState({
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    dueDay: 5,
  });

  // El listado y lo que se emite siguen el mes elegido en la cabecera.
  const { month, year } = useSelector((s) => s.period);

  useEffect(() => {
    dispatch(paymentThunks.fetchPaymentSummary({ year }));
  }, [dispatch, year]);

  useEffect(() => {
    dispatch(resourceActions.payments.setFilter({ key: 'periodMonth', value: String(month) }));
    dispatch(resourceActions.payments.setFilter({ key: 'periodYear', value: String(year) }));
  }, [dispatch, month, year]);

  const openSettle = (row) => {
    setSettleFor(row);
    setSettleForm({ amount: String(row.balance ?? ''), method: row.method || 'efectivo', reference: '' });
    setSettleError(null);
  };

  const submitSettle = async (e) => {
    e.preventDefault();
    const res = await dispatch(paymentThunks.settlePayment({ id: settleFor.id, ...settleForm }));
    if (res.error) {
      setSettleError(res.payload || 'No se pudo registrar el abono');
      return;
    }
    dispatch(pushToast('Abono registrado'));
    dispatch(paymentThunks.fetchPaymentSummary({ year: today.getFullYear() }));
    setSettleFor(null);
  };

  const submitVoid = async () => {
    const res = await dispatch(paymentThunks.voidPayment({ id: voidFor.id, reason: voidReason }));
    dispatch(
      pushToast(
        res.error
          ? { message: res.payload || 'No se pudo anular', type: 'error' }
          : 'Pago anulado'
      )
    );
    setVoidFor(null);
    setVoidReason('');
  };

  const restore = async (row) => {
    const res = await dispatch(paymentThunks.restorePayment(row.id));
    dispatch(
      pushToast(
        res.error ? { message: res.payload, type: 'error' } : 'Pago restaurado'
      )
    );
  };

  const submitGenerate = async (e) => {
    e.preventDefault();
    const res = await dispatch(paymentThunks.generateMonthly(genForm));
    dispatch(
      pushToast(
        res.error
          ? { message: res.payload || 'No se pudieron generar', type: 'error' }
          : res.payload.message
      )
    );
    if (!res.error) {
      setGenOpen(false);
      dispatch(paymentThunks.fetchPaymentSummary({ year: today.getFullYear() }));
    }
  };

  const columns = [
    {
      key: 'receiptNumber',
      header: 'Recibo',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.receiptNumber || `#${r.id}`}</strong>
          <small>{label('conceptType', r.conceptType)}</small>
        </div>
      ),
    },
    {
      key: 'concept',
      header: 'Concepto',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.concept}</span>
          <small>{r.studentName}</small>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Fechas',
      render: (r) => (
        <div className="cell-stack">
          <span>Pago: {date(r.paymentDate)}</span>
          <small>Vence: {date(r.dueDate)}</small>
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Referencia',
      render: (r) => (
        <div className="cell-stack">
          {r.reference ? <span className="ref-text">{r.reference}</span> : <span className="muted">-</span>}
          <small>{label('method', r.method)}</small>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (r) => (
        <div className="cell-stack align-right">
          <strong>{money(r.total)}</strong>
          {(Number(r.discount) > 0 || Number(r.surcharge) > 0) && (
            <small>
              {Number(r.discount) > 0 ? `-${money(r.discount)} ` : ''}
              {Number(r.surcharge) > 0 ? `+${money(r.surcharge)}` : ''}
            </small>
          )}
        </div>
      ),
    },
    { key: 'paidAmount', header: 'Abonado', align: 'right', render: (r) => money(r.paidAmount) },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      render: (r) => (
        <strong className={r.balance > 0 ? 'text-warning' : 'text-success'}>{money(r.balance)}</strong>
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
    {
      name: 'studentId',
      label: 'Alumno',
      type: 'select',
      options: studentOptions,
      required: true,
      span: 2,
      hint: 'El cobro queda registrado a nombre del alumno',
    },
    { name: 'concept', label: 'Concepto', required: true, span: 2, placeholder: 'Mensualidad de marzo' },
    {
      name: 'conceptType',
      label: 'Tipo de concepto',
      type: 'select',
      options: conceptOptions,
      defaultValue: 'mensualidad',
      placeholder: null,
    },
    { name: 'amount', label: 'Monto', type: 'number', required: true, defaultValue: 0 },
    { name: 'discount', label: 'Descuento', type: 'number', defaultValue: 0 },
    { name: 'surcharge', label: 'Recargo por mora', type: 'number', defaultValue: 0 },
    {
      name: 'paidAmount',
      label: 'Monto abonado',
      type: 'number',
      defaultValue: 0,
      hint: 'El estado del recibo se calcula con este valor',
    },
    {
      name: 'method',
      label: 'Metodo de pago',
      type: 'select',
      options: methodOptions,
      defaultValue: 'efectivo',
      placeholder: null,
    },
    { name: 'periodMonth', label: 'Mes del periodo', type: 'select', options: monthOptions },
    { name: 'periodYear', label: 'Anio del periodo', type: 'number', step: '1', defaultValue: today.getFullYear() },
    { name: 'dueDate', label: 'Fecha de vencimiento', type: 'date' },
    { name: 'paymentDate', label: 'Fecha de pago', type: 'date' },
    { name: 'reference', label: 'Referencia', span: 2, placeholder: 'Numero de transferencia o comprobante' },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];

  const statusTotals = summary?.byStatus || [];
  const totalOf = (status) => statusTotals.find((s) => s.status === status) || { total: 0, balance: 0, paid: 0, count: 0 };

  /*
   * Los cuatro indicadores parten el mismo dinero en dos mitades que suman lo
   * facturado: lo que YA ENTRO y lo que FALTA. Antes se mezclaban —un abono
   * parcial (dinero recibido) al lado de un saldo (dinero que deben)— y no se
   * distinguia cual era cual ni cuadraban entre si.
   */
  const anulado = totalOf('anulado');
  const facturado = statusTotals
    .filter((s) => s.status !== 'anulado')
    .reduce((a, s) => a + s.total, 0);
  const cobrado = statusTotals
    .filter((s) => s.status !== 'anulado')
    .reduce((a, s) => a + s.paid, 0);
  const porCobrar = Math.round((facturado - cobrado) * 100) / 100;
  const enMora = totalOf('vencido').balance;
  const abiertos = totalOf('pendiente').count + totalOf('parcial').count + totalOf('vencido').count;

  return (
    <>
      {/* Las mensualidades van en dolares pero muchas veces se cobran en
          bolivares al cambio del dia: la tasa tiene que estar a mano. */}
      <ExchangeRate />

      <ResourcePage
        title="Pagos"
        subtitle="Registro historico y modificable de todo lo que se cobra por cada alumno"
        sliceName="payments"
        thunks={paymentThunks}
        actions={resourceActions.payments}
        columns={columns}
        entityName="pago"
        createLabel="Registrar pago"
        searchPlaceholder="Buscar por recibo, concepto o referencia..."
        formSize="xl"
        filters={[
          { key: 'status', label: 'Todos los estados', options: statusOptions },
          { key: 'conceptType', label: 'Todos los conceptos', options: conceptOptions },
          { key: 'studentId', label: 'Todos los alumnos', options: studentOptions },
          { key: 'periodMonth', label: 'Todos los meses', options: monthOptions },
        ]}
        formFields={formFields}
        toolbarExtra={
          <button type="button" className="btn btn-ghost" onClick={openGenerate}>
            <IconReceipt size={16} /> Generar mensualidades
          </button>
        }
        rowActions={(row) =>
          row.status === 'anulado' ? (
            <button type="button" className="icon-btn" title="Restaurar" onClick={() => restore(row)}>
              <IconRefresh size={16} />
            </button>
          ) : (
            <>
              {row.balance > 0 && (
                <button
                  type="button"
                  className="icon-btn icon-btn-success"
                  title="Registrar abono"
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
              <StatCard
                label="Facturado (historico)"
                value={money(facturado)}
                hint={`Todo lo emitido desde el inicio${anulado.count ? ` - ${anulado.count} anulado(s) aparte` : ''}`}
              />
              <StatCard
                label="Cobrado (historico)"
                value={money(cobrado)}
                hint={`${money(totalOf('pagado').paid)} de recibos pagados + ${money(totalOf('parcial').paid)} en abonos`}
                tone="success"
                valueTone="success"
              />
              <StatCard
                label="Por cobrar"
                value={money(porCobrar)}
                hint={`Lo que falta, en ${abiertos} recibo(s) abiertos`}
                tone={porCobrar > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="En mora"
                value={money(enMora)}
                hint={
                  porCobrar > 0
                    ? `De lo por cobrar, esto ya vencio (${totalOf('vencido').count} recibos)`
                    : 'Nada vencido'
                }
                tone={enMora > 0 ? 'danger' : 'success'}
                valueTone={enMora > 0 ? 'danger' : undefined}
              />
            </div>
          )
        }
      />

      {/* Abono */}
      <Modal
        open={Boolean(settleFor)}
        size="sm"
        title="Registrar abono"
        onClose={() => setSettleFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSettleFor(null)}>
              Cancelar
            </button>
            <button type="submit" form="settle-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </>
        }
      >
        <form id="settle-form" onSubmit={submitSettle} className="form-grid">
          <ErrorBanner message={settleError} onClose={() => setSettleError(null)} />
          <p className="muted field-span-2">
            {settleFor?.concept} - saldo pendiente{' '}
            <strong className="text-warning">{money(settleFor?.balance)}</strong>
          </p>
          <Field label="Monto del abono" required span={2}>
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

      {/* Anulacion */}
      <Modal
        open={Boolean(voidFor)}
        size="sm"
        title="Anular pago"
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
          El recibo <strong>{voidFor?.receiptNumber}</strong> quedara marcado como anulado y dejara de
          sumar en los totales, pero se conserva para auditoria.
        </p>
        <Field label="Motivo">
          <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Cobro duplicado" />
        </Field>
      </Modal>

      {/* Generacion masiva */}
      <Modal
        open={genOpen}
        size="sm"
        title="Generar mensualidades"
        onClose={() => setGenOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setGenOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="gen-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Generando...' : 'Generar'}
            </button>
          </>
        }
      >
        <form id="gen-form" onSubmit={submitGenerate} className="form-grid">
          <p className="muted field-span-2">
            El mes en curso se emite solo: al empezar un mes nuevo, todos los alumnos activos
            aparecen con su mensualidad pendiente sin que haya que pulsar nada. Esto sirve para
            emitir un mes pasado o para rehacerlo despues de cambiar mensualidades. Los que ya
            tengan recibo de ese periodo se omiten, asi que repetirlo no duplica nada.
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
          <Field label="Dia de vencimiento" span={2} hint="Entre 1 y 28">
            <Input
              type="number"
              step="1"
              min="1"
              max="28"
              value={genForm.dueDay}
              onChange={(e) => setGenForm({ ...genForm, dueDay: Number(e.target.value) })}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
