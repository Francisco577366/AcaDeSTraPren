import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { workThunks } from '../store/slices/resourceSlices';
import { resourceActions } from '../store';
import { pushToast } from '../store/slices/uiSlice';
import { LABELS, money, num, date, label } from '../utils/format';
import {
  optionsFrom, Modal, Badge, StatCard, Field, Input, ErrorBanner,
} from '../components/ui';
import { IconMoney, IconReceipt } from '../components/Icons';
import ResourcePage from '../components/ResourcePage';

const statusOptions = optionsFrom(LABELS.workStatus);
const paymentStatusOptions = optionsFrom(LABELS.workPaymentStatus);
const categoryOptions = optionsFrom(LABELS.workCategory);

export default function Works() {
  const dispatch = useDispatch();
  const summary = useSelector((s) => s.works.summary);
  const saving = useSelector((s) => s.works.saving);
  const studentOptions = useSelector((s) =>
    s.options.students.map((st) => ({ value: st.id, label: st.fullName }))
  );
  const teacherOptions = useSelector((s) =>
    s.options.teachers.map((t) => ({ value: t.id, label: t.fullName }))
  );

  const [settleFor, setSettleFor] = useState(null);
  const [amount, setAmount] = useState('');
  const [settleError, setSettleError] = useState(null);

  const refreshSummary = () => dispatch(workThunks.fetchWorkSummary());

  useEffect(() => {
    refreshSummary();
  }, [dispatch]);

  const openSettle = (row) => {
    setSettleFor(row);
    setAmount(String(row.balance ?? ''));
    setSettleError(null);
  };

  const submitSettle = async (e) => {
    e.preventDefault();
    const res = await dispatch(workThunks.settleWork({ id: settleFor.id, amount: Number(amount) }));
    if (res.error) {
      setSettleError(res.payload || 'No se pudo registrar el abono');
      return;
    }
    dispatch(pushToast('Abono registrado'));
    refreshSummary();
    setSettleFor(null);
  };

  const invoice = async (row) => {
    const res = await dispatch(workThunks.invoiceWork({ id: row.id }));
    dispatch(
      pushToast(
        res.error
          ? { message: res.payload || 'No se pudo emitir el cobro', type: 'error' }
          : 'Cobro emitido'
      )
    );
  };

  const columns = [
    {
      key: 'title',
      header: 'Trabajo',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.title}</strong>
          <small>
            {r.code} - {label('workCategory', r.category)}
          </small>
        </div>
      ),
    },
    {
      key: 'studentName',
      header: 'Alumno',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.studentName || '-'}</span>
          <small>{r.teacherName || 'Sin profesor asignado'}</small>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Fechas',
      render: (r) => (
        <div className="cell-stack">
          <span>Entrega: {date(r.dueDate)}</span>
          <small>Asignado: {date(r.assignedDate)}</small>
        </div>
      ),
    },
    {
      key: 'totalCost',
      header: 'Costo',
      align: 'right',
      render: (r) => (
        <div className="cell-stack align-right">
          <strong>{money(r.totalCost)}</strong>
          <small>
            Mat. {money(r.materialCost)} / M.O. {money(r.laborCost)}
          </small>
        </div>
      ),
    },
    { key: 'price', header: 'Precio', align: 'right', render: (r) => money(r.price) },
    {
      key: 'margin',
      header: 'Margen',
      align: 'right',
      render: (r) => (
        <strong className={r.margin >= 0 ? 'text-success' : 'text-danger'}>{money(r.margin)}</strong>
      ),
    },
    {
      key: 'balance',
      header: 'Por cobrar',
      align: 'right',
      render: (r) => (
        <span className={r.balance > 0 ? 'text-warning' : 'text-success'}>{money(r.balance)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      align: 'center',
      render: (r) => (
        <div className="badge-stack">
          <Badge value={r.status} group="workStatus" />
          <Badge value={r.paymentStatus} group="workPaymentStatus" />
        </div>
      ),
    },
  ];

  const formFields = [
    { name: 'studentId', label: 'Alumno', type: 'select', options: studentOptions, required: true },
    { name: 'teacherId', label: 'Profesor a cargo', type: 'select', options: teacherOptions },
    {
      name: 'category',
      label: 'Categoria',
      type: 'select',
      options: categoryOptions,
      defaultValue: 'proyecto',
      placeholder: null,
    },
    { name: 'title', label: 'Titulo del trabajo', required: true, span: 2 },
    { name: 'description', label: 'Descripcion', type: 'textarea', span: 2 },
    { name: 'assignedDate', label: 'Fecha de asignacion', type: 'date' },
    { name: 'dueDate', label: 'Fecha de entrega', type: 'date' },
    { name: 'deliveryDate', label: 'Entregado el', type: 'date' },
    {
      name: 'status',
      label: 'Estado',
      type: 'select',
      options: statusOptions,
      defaultValue: 'pendiente',
      placeholder: null,
    },
    {
      name: 'materialCost',
      label: 'Costo de materiales',
      type: 'number',
      defaultValue: 0,
      hint: 'Lo que le cuesta a la academia',
    },
    { name: 'laborCost', label: 'Costo de mano de obra', type: 'number', defaultValue: 0 },
    {
      name: 'price',
      label: 'Precio a cobrar',
      type: 'number',
      defaultValue: 0,
      hint: 'Deja 0 si el trabajo no se cobra',
    },
    { name: 'paidAmount', label: 'Monto abonado', type: 'number', defaultValue: 0 },
    { name: 'grade', label: 'Nota (0-20)', type: 'number', min: 0, max: 20 },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <ResourcePage
        title="Trabajos de alumnos"
        subtitle="Seguimiento de cada trabajo con su costo real, lo cobrado y el margen"
        sliceName="works"
        thunks={workThunks}
        actions={resourceActions.works}
        columns={columns}
        entityName="trabajo"
        createLabel="Nuevo trabajo"
        searchPlaceholder="Buscar por titulo, codigo o descripcion..."
        formSize="xl"
        filters={[
          { key: 'status', label: 'Todos los estados', options: statusOptions },
          { key: 'paymentStatus', label: 'Todos los cobros', options: paymentStatusOptions },
          { key: 'category', label: 'Todas las categorias', options: categoryOptions },
          { key: 'studentId', label: 'Todos los alumnos', options: studentOptions },
        ]}
        formFields={formFields}
        rowActions={(row) => (
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
            {Number(row.price) > 0 && (
              <button
                type="button"
                className="icon-btn"
                title="Emitir el cobro"
                onClick={() => invoice(row)}
              >
                <IconReceipt size={16} />
              </button>
            )}
          </>
        )}
        headerExtra={
          summary && (
            <div className="stat-grid stat-grid-sm">
              <StatCard label="Costo acumulado" value={money(summary.totals.totalCost)} />
              <StatCard label="Facturado" value={money(summary.totals.billed)} tone="info" />
              <StatCard label="Cobrado" value={money(summary.totals.paid)} tone="success" />
              <StatCard label="Por cobrar" value={money(summary.totals.pending)} tone="warning" />
              <StatCard
                label="Margen"
                value={money(summary.totals.margin)}
                hint={`${num(summary.totals.marginPercent, 1)}% sobre lo facturado`}
                tone={summary.totals.margin >= 0 ? 'success' : 'danger'}
              />
            </div>
          )
        }
      />

      <Modal
        open={Boolean(settleFor)}
        size="sm"
        title="Registrar abono del trabajo"
        onClose={() => setSettleFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSettleFor(null)}>
              Cancelar
            </button>
            <button type="submit" form="settle-work-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </>
        }
      >
        <form id="settle-work-form" onSubmit={submitSettle} className="form-grid">
          <ErrorBanner message={settleError} onClose={() => setSettleError(null)} />
          <p className="muted field-span-2">
            {settleFor?.title} - por cobrar{' '}
            <strong className="text-warning">{money(settleFor?.balance)}</strong>
          </p>
          <Field label="Monto del abono" required span={2}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={settleFor?.balance}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
