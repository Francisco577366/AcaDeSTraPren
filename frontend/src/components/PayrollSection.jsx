import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { pushToast } from '../store/slices/uiSlice';
import { LABELS, money, date, MONTHS, label } from '../utils/format';
import { optionsFrom, Modal, Badge, StatCard, Field, Input, Select, ErrorBanner } from './ui';
import { IconMoney, IconBan, IconWallet } from './Icons';
import ResourcePage from './ResourcePage';

const statusOptions = optionsFrom(LABELS.paymentStatus).filter((o) => o.value !== 'vencido');
const conceptOptions = optionsFrom(LABELS.teacherConceptType);
const methodOptions = optionsFrom(LABELS.method);
const monthOptions = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

const today = new Date();

/**
 * Semanas que se pagan en un periodo. Copia de backend/src/utils/payroll.js
 * para que el formulario proponga el mismo numero que va a calcular el API:
 * el mes completo, y solo lo trabajado en el mes en que abrio la academia.
 */
export function weeksForPeriod(month, year, settings) {
  const full = Number(settings.weeksPerMonth) || 4;
  const start = new Date(`${settings.academyStartDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return full;

  const startMonth = start.getUTCMonth() + 1;
  const startYear = start.getUTCFullYear();

  if (year < startYear || (year === startYear && month < startMonth)) return 0;
  if (year > startYear || month > startMonth) return full;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const workedDays = daysInMonth - start.getUTCDate() + 1;
  return Math.max(0, Math.round((workedDays / daysInMonth) * full * 2) / 2);
}

/**
 * Lo mismo que calculara el backend al guardar, mostrado mientras se
 * escribe: semanas x pago semanal da el monto, y de ahi sale el saldo.
 */
function computeReceipt(values) {
  const weeks = Number(values.weeks) || 0;
  const weeklyRate = Number(values.weeklyRate) || 0;
  const base = weeks > 0 && weeklyRate > 0 ? weeks * weeklyRate : 0;
  const total = base + (Number(values.bonus) || 0) - (Number(values.deductions) || 0);
  const balance = Math.max(0, total - (Number(values.paidAmount) || 0));

  return (
    <>
      <div>
        <span>Monto del periodo</span>
        <strong>{money(base)}</strong>
      </div>
      <div>
        <span>Total con bonos</span>
        <strong className="text-success">{money(total)}</strong>
      </div>
      <div>
        <span>Queda por pagar</span>
        <strong className={balance > 0 ? 'text-warning' : 'text-success'}>{money(balance)}</strong>
      </div>
      <div>
        <span>Detalle</span>
        <strong className="muted" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
          {base > 0
            ? `${weeks} semana${weeks === 1 ? '' : 's'} x ${money(weeklyRate)}`
            : 'Indica las semanas y el pago semanal'}
        </strong>
      </div>
    </>
  );
}

/**
 * Nomina de un grupo de personas. La docente y la de la libreria funcionan
 * igual —semanas trabajadas por el pago semanal—, asi que comparten esta
 * pantalla y solo cambian a quien se le paga y como se llama el campo.
 */
export default function PayrollSection({
  sliceName,
  thunks,
  actions,
  people,
  personField,
  personNameField,
  personKey,
  personLabel,
  peopleFilterLabel,
  title,
  subtitle,
  conceptPlaceholder,
  weeklyRateHint,
  payrollNote,
  defaultMethod = 'transferencia',
  settleThunk,
  voidThunk,
  generateThunk,
  summaryThunk,
}) {
  const dispatch = useDispatch();
  const summary = useSelector((s) => s[sliceName].summary);
  const saving = useSelector((s) => s[sliceName].saving);
  const settings = useSelector((s) => s.options.settings);
  const periodo = useSelector((s) => s.period);
  const peopleOptions = useMemo(
    () => people.map((p) => ({ value: p.id, label: p.fullName })),
    [people]
  );

  const [settleFor, setSettleFor] = useState(null);
  const [settleForm, setSettleForm] = useState({ amount: '', method: defaultMethod, reference: '' });
  const [settleError, setSettleError] = useState(null);
  const [voidFor, setVoidFor] = useState(null);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [payrollForm, setPayrollForm] = useState({
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    weeks: weeksForPeriod(today.getMonth() + 1, today.getFullYear(), settings),
  });

  /** Al cambiar el periodo se repropone la cantidad de semanas. */
  const setPayrollPeriod = (patch) =>
    setPayrollForm((prev) => {
      const next = { ...prev, ...patch };
      return { ...next, weeks: weeksForPeriod(next.month, next.year, settings) };
    });

  const refreshSummary = () => dispatch(summaryThunk({ year: today.getFullYear() }));

  useEffect(() => {
    refreshSummary();
  }, [dispatch]);

  const openSettle = (row) => {
    setSettleFor(row);
    setSettleForm({
      amount: String(row.balance ?? ''),
      method: row.method || defaultMethod,
      reference: '',
    });
    setSettleError(null);
  };

  const submitSettle = async (e) => {
    e.preventDefault();
    const res = await dispatch(settleThunk({ id: settleFor.id, ...settleForm }));
    if (res.error) {
      setSettleError(res.payload || 'No se pudo registrar el abono');
      return;
    }
    dispatch(pushToast('Pago registrado'));
    refreshSummary();
    setSettleFor(null);
  };

  const submitVoid = async () => {
    const res = await dispatch(voidThunk({ id: voidFor.id, reason: 'Anulado desde el panel' }));
    dispatch(pushToast(res.error ? { message: res.payload, type: 'error' } : 'Pago anulado'));
    setVoidFor(null);
  };

  const submitPayroll = async (e) => {
    e.preventDefault();
    const res = await dispatch(generateThunk(payrollForm));
    dispatch(pushToast(res.error ? { message: res.payload, type: 'error' } : res.payload.message));
    if (!res.error) {
      setPayrollOpen(false);
      refreshSummary();
    }
  };

  const columns = [
    {
      key: 'receiptNumber',
      header: 'Recibo',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.receiptNumber || `#${r.id}`}</strong>
          <small>{label('teacherConceptType', r.conceptType)}</small>
        </div>
      ),
    },
    {
      key: personNameField,
      header: personLabel,
      render: (r) => (
        <div className="cell-stack">
          <strong>{r[personNameField] || '-'}</strong>
          <small>{r[personKey]?.documentId || ''}</small>
        </div>
      ),
    },
    {
      key: 'concept',
      header: 'Concepto',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.concept}</span>
          {Number(r.weeks) > 0 ? (
            <small>
              {Number(r.weeks)} sem x {money(r.weeklyRate)}
            </small>
          ) : (
            Number(r.hours) > 0 && (
              <small>
                {r.hours} h x {money(r.rate)}
              </small>
            )
          )}
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Periodo',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.periodLabel || '-'}</span>
          <small>{date(r.paymentDate || r.dueDate)}</small>
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
          {(Number(r.bonus) > 0 || Number(r.deductions) > 0) && (
            <small>
              {Number(r.bonus) > 0 ? `+${money(r.bonus)} ` : ''}
              {Number(r.deductions) > 0 ? `-${money(r.deductions)}` : ''}
            </small>
          )}
        </div>
      ),
    },
    { key: 'paidAmount', header: 'Pagado', align: 'right', render: (r) => money(r.paidAmount) },
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
      name: personField,
      label: personLabel,
      type: 'select',
      options: peopleOptions,
      required: true,
      // Elegir a la persona trae su pago semanal, que es la base del recibo.
      derive: (value) => {
        const person = people.find((p) => String(p.id) === String(value));
        return person ? { weeklyRate: Number(person.weeklySalary) || 0 } : {};
      },
    },
    { name: 'concept', label: 'Concepto', required: true, span: 2, placeholder: conceptPlaceholder },
    {
      name: 'conceptType',
      label: 'Tipo',
      type: 'select',
      options: conceptOptions,
      defaultValue: 'salario',
      placeholder: null,
    },
    {
      name: 'periodMonth',
      label: 'Mes',
      type: 'select',
      options: monthOptions,
      defaultValue: today.getMonth() + 1,
      // Cambiar el periodo repropone las semanas que se trabajaron en el.
      derive: (value, prev) => ({
        weeks: weeksForPeriod(Number(value), Number(prev.periodYear) || today.getFullYear(), settings),
      }),
    },
    {
      name: 'periodYear',
      label: 'Anio',
      type: 'number',
      step: '1',
      defaultValue: today.getFullYear(),
      derive: (value, prev) => ({
        weeks: weeksForPeriod(Number(prev.periodMonth) || today.getMonth() + 1, Number(value), settings),
      }),
    },
    {
      name: 'weeks',
      label: 'Semanas trabajadas',
      type: 'number',
      step: '0.5',
      min: 0,
      defaultValue: weeksForPeriod(today.getMonth() + 1, today.getFullYear(), settings),
      hint: `Un mes completo son ${settings.weeksPerMonth} semanas`,
    },
    {
      name: 'weeklyRate',
      label: 'Pago semanal',
      type: 'number',
      defaultValue: 0,
      hint: weeklyRateHint,
    },
    {
      name: '__calculo',
      label: 'Asi queda el recibo',
      type: 'computed',
      span: 2,
      compute: computeReceipt,
    },
    { name: 'bonus', label: 'Bonos', type: 'number', defaultValue: 0 },
    { name: 'deductions', label: 'Deducciones', type: 'number', defaultValue: 0 },
    { name: 'paidAmount', label: 'Monto pagado', type: 'number', defaultValue: 0 },
    {
      name: 'method',
      label: 'Metodo',
      type: 'select',
      options: methodOptions,
      defaultValue: defaultMethod,
      placeholder: null,
    },
    { name: 'dueDate', label: 'Fecha limite', type: 'date' },
    { name: 'paymentDate', label: 'Fecha de pago', type: 'date' },
    { name: 'reference', label: 'Referencia', span: 2 },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];

  const totalOf = (status) =>
    summary?.byStatus?.find((s) => s.status === status) || { total: 0, balance: 0, paid: 0 };

  return (
    <>
      <ResourcePage
        title={title}
        subtitle={subtitle}
        sliceName={sliceName}
        thunks={thunks}
        actions={actions}
        columns={columns}
        entityName="pago"
        createLabel="Registrar pago"
        searchPlaceholder="Buscar por recibo, concepto o referencia..."
        formSize="xl"
        filters={[
          { key: 'status', label: 'Todos los estados', options: statusOptions },
          { key: personField, label: peopleFilterLabel, options: peopleOptions },
          { key: 'conceptType', label: 'Todos los conceptos', options: conceptOptions },
          { key: 'periodMonth', label: 'Todos los meses', options: monthOptions },
        ]}
        formFields={formFields}
        toolbarExtra={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPayrollPeriod({ month: periodo.month, year: periodo.year });
              setPayrollOpen(true);
            }}
          >
            <IconWallet size={16} /> Generar nomina
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
              <StatCard label="Pagado del anio" value={money(totalOf('pagado').paid)} tone="success" />
              <StatCard label="Abonos parciales" value={money(totalOf('parcial').paid)} tone="info" />
              <StatCard
                label="Por pagar"
                value={money(totalOf('pendiente').balance + totalOf('parcial').balance)}
                tone="warning"
              />
              <StatCard label="Recibos pendientes" value={totalOf('pendiente').count || 0} />
            </div>
          )
        }
      />

      <Modal
        open={Boolean(settleFor)}
        size="sm"
        title={`Registrar pago - ${personLabel.toLowerCase()}`}
        onClose={() => setSettleFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSettleFor(null)}>
              Cancelar
            </button>
            <button type="submit" form="settle-payroll-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </>
        }
      >
        <form id="settle-payroll-form" onSubmit={submitSettle} className="form-grid">
          <ErrorBanner message={settleError} onClose={() => setSettleError(null)} />
          <p className="muted field-span-2">
            {settleFor?.[personNameField]} - saldo{' '}
            <strong className="text-warning">{money(settleFor?.balance)}</strong>
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
          El recibo <strong>{voidFor?.receiptNumber}</strong> quedara anulado y dejara de sumar en la
          nomina.
        </p>
      </Modal>

      <Modal
        open={payrollOpen}
        size="sm"
        title="Generar nomina del periodo"
        onClose={() => setPayrollOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPayrollOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="payroll-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Generando...' : 'Generar'}
            </button>
          </>
        }
      >
        <form id="payroll-form" onSubmit={submitPayroll} className="form-grid">
          <p className="muted field-span-2">{payrollNote}</p>
          <Field label="Mes">
            <Select
              value={payrollForm.month}
              options={monthOptions}
              placeholder={null}
              onChange={(e) => setPayrollPeriod({ month: Number(e.target.value) })}
            />
          </Field>
          <Field label="Anio">
            <Input
              type="number"
              step="1"
              value={payrollForm.year}
              onChange={(e) => setPayrollPeriod({ year: Number(e.target.value) })}
            />
          </Field>
          <Field
            label="Semanas a pagar"
            span={2}
            hint={`Un mes completo son ${settings.weeksPerMonth} semanas; el periodo de apertura paga solo lo trabajado`}
          >
            <Input
              type="number"
              step="0.5"
              min="0.5"
              required
              value={payrollForm.weeks}
              onChange={(e) => setPayrollForm({ ...payrollForm, weeks: Number(e.target.value) })}
            />
          </Field>
          <p className="muted field-span-2">
            Se emitiran recibos de{' '}
            <strong>
              {payrollForm.weeks} semana{payrollForm.weeks === 1 ? '' : 's'}
            </strong>{' '}
            para {MONTHS[payrollForm.month - 1]} {payrollForm.year}.
          </p>
        </form>
      </Modal>
    </>
  );
}
