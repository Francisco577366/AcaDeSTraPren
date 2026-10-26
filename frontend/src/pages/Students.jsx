import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { studentThunks } from '../store/slices/resourceSlices';
import { fetchOverview, fetchDebtors } from '../store/slices/dashboardSlice';
import { resourceActions } from '../store';
import { pushToast } from '../store/slices/uiSlice';
import { LABELS, money, date, label, MONTHS } from '../utils/format';
import {
  optionsFrom, Modal, Badge, Loader, StatCard, EmptyState, Field, Input, Select, ErrorBanner,
} from '../components/ui';
import { IconReceipt, IconMoney, IconCheck, IconEdit } from '../components/Icons';
import ResourcePage from '../components/ResourcePage';
import PaymentStatusModal from '../components/PaymentStatusModal';

const statusOptions = optionsFrom(LABELS.studentStatus);
const paymentStateOptions = optionsFrom(LABELS.paymentState);
/** Que hacer con un cobro al registrar al alumno. */
const chargeOptions = [
  { value: 'pendiente', label: 'Pendiente de pago' },
  { value: 'pagado', label: 'Ya la pago' },
  { value: 'ninguno', label: 'No emitir cobro' },
];
const methodOptions = optionsFrom(LABELS.method);

export default function Students() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const profile = useSelector((s) => s.students.profile);
  const saving = useSelector((s) => s.students.saving);
  const baseMonthlyFee = useSelector((s) => s.options.settings.baseMonthlyFee);
  const baseEnrollmentFee = useSelector((s) => s.options.settings.baseEnrollmentFee);

  // Alumnos responde al mes de la cabecera: quien pago ESE mes y quien debe.
  const { month, year } = useSelector((s) => s.period);

  const [profileFor, setProfileFor] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [statusFor, setStatusFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'efectivo', reference: '' });
  const [payError, setPayError] = useState(null);

  useEffect(() => {
    dispatch(resourceActions.students.setFilter({ key: 'periodMonth', value: String(month) }));
    dispatch(resourceActions.students.setFilter({ key: 'periodYear', value: String(year) }));
  }, [dispatch, month, year]);

  /** Lleva a Pagos con el listado ya filtrado por este alumno. */
  const editPayments = (student) => {
    dispatch(resourceActions.payments.setFilter({ key: 'studentId', value: String(student.id) }));
    setProfileFor(null);
    navigate('/pagos');
  };

  const openProfile = async (row) => {
    setProfileFor(row);
    setLoadingProfile(true);
    await dispatch(studentThunks.fetchProfile(row.id));
    setLoadingProfile(false);
  };

  const openPay = (row) => {
    setPayFor(row);
    // Arranca con la deuda entera: lo normal es que paguen todo.
    setPayForm({ amount: String(row.balance ?? ''), method: 'efectivo', reference: '' });
    setPayError(null);
  };

  const abono = Number(payForm.amount) || 0;

  const confirmPay = async (e) => {
    e.preventDefault();
    const res = await dispatch(studentThunks.settleStudentDebt({ id: payFor.id, ...payForm }));

    if (res.error) {
      setPayError(res.payload || 'No se pudo confirmar el pago');
      return;
    }

    dispatch(pushToast(res.payload.message));
    setPayFor(null);
    // Los indicadores del panel dependen de esta deuda.
    dispatch(fetchOverview());
    dispatch(fetchDebtors({ limit: 6 }));
  };

  const columns = [
    {
      key: 'fullName',
      header: 'Alumno',
      render: (r) => (
        <button type="button" className="link-cell" onClick={() => openProfile(r)}>
          {r.fullName || r.firstName}
        </button>
      ),
    },
    { key: 'documentId', header: 'Cedula', render: (r) => r.documentId || '-' },
    { key: 'grade', header: 'Grado', render: (r) => r.grade || '-' },
    {
      key: 'monthlyFee',
      header: 'Mensualidad',
      align: 'right',
      render: (r) =>
        Number(r.monthlyFee) > 0 ? (
          <strong>{money(r.monthlyFee)}</strong>
        ) : (
          <span className="muted">Sin mensualidad</span>
        ),
    },
    {
      key: 'balance',
      header: `Cobro de ${MONTHS[month - 1]}`,
      align: 'right',
      render: (r) => (
        <button
          type="button"
          className="status-cell"
          title="Editar el estado de pago"
          onClick={() => setStatusFor(r)}
        >
          {r.paymentState === 'sin_emitir' ? (
            // Sin recibo del mes no se sabe nada: ni debe ni esta al dia.
            <span className="muted">Sin emitir</span>
          ) : r.balance > 0 ? (
            <span className="cell-stack align-right">
              <strong className={r.overdue > 0 ? 'text-danger' : 'text-warning'}>
                {money(r.balance)}
              </strong>
              {/* Quien ya abono algo se distingue de quien no ha dado nada. */}
              <small>
                {r.paidOpen > 0
                  ? `Abono ${money(r.paidOpen)} de ${money(r.balance + r.paidOpen)}`
                  : `${r.pendingCount} cobro${r.pendingCount === 1 ? '' : 's'}${
                      r.overdue > 0 ? ` - ${money(r.overdue)} vencido` : ''
                    }`}
              </small>
            </span>
          ) : (
            <span className="paid-chip">
              <IconCheck size={13} /> Pagado
            </span>
          )}
          <IconEdit size={13} className="status-cell-pencil" />
        </button>
      ),
    },
    {
      // "Estado" se confundia con el del pago: aqui Activo significa que el
      // alumno sigue inscrito, no que haya pagado.
      key: 'status',
      header: 'Matricula',
      align: 'center',
      render: (r) => <Badge value={r.status} group="studentStatus" />,
    },
  ];

  const formFields = [
    { name: 'firstName', label: 'Nombre', required: true },
    { name: 'lastName', label: 'Apellido' },
    { name: 'documentId', label: 'Cedula', placeholder: 'V-30112233' },
    { name: 'grade', label: 'Grado', placeholder: '4to grado' },
    {
      name: 'monthlyFee',
      label: 'Mensualidad',
      type: 'preset-number',
      required: true,
      defaultValue: baseMonthlyFee,
      presets: [
        { value: baseMonthlyFee, label: `Precio base (${money(baseMonthlyFee)})` },
        { value: 0, label: 'Sin mensualidad' },
      ],
      customLabel: 'Otro monto',
      hint: 'Se factura cada mes',
    },
    {
      name: 'status',
      label: 'Estado',
      type: 'select',
      options: statusOptions,
      defaultValue: 'activo',
      placeholder: null,
    },
    // Solo al dar de alta: de aqui salen sus primeros cobros. Sin esto el
    // alumno entraba sin nada emitido y el listado lo daba por "Al dia".
    {
      name: 'monthlyCharge',
      label: 'Mensualidad de este mes',
      type: 'select',
      options: chargeOptions,
      defaultValue: 'pendiente',
      placeholder: null,
      hiddenOnEdit: true,
      hint: 'Se emite el cobro del mes en curso',
    },
    {
      name: 'enrollmentFee',
      label: 'Inscripcion',
      type: 'number',
      defaultValue: baseEnrollmentFee,
      hiddenOnEdit: true,
      hint: 'Deja 0 si no le cobras inscripcion',
    },
    {
      name: 'enrollmentCharge',
      label: 'Pago de la inscripcion',
      type: 'select',
      options: chargeOptions,
      defaultValue: 'pendiente',
      placeholder: null,
      hiddenOnEdit: true,
    },
  ];

  return (
    <>
      <ResourcePage
        title="Alumnos"
        subtitle={`Quien pago y quien debe en ${MONTHS[month - 1]} ${year}`}
        sliceName="students"
        thunks={studentThunks}
        actions={resourceActions.students}
        columns={columns}
        entityName="alumno"
        createLabel="Nuevo alumno"
        searchPlaceholder="Buscar por nombre, cedula o grado..."
        filters={[
          { key: 'status', label: 'Toda la matricula', options: statusOptions },
          { key: 'paymentState', label: 'Toda la cobranza', options: paymentStateOptions },
        ]}
        formFields={formFields}
        rowActions={(row) => (
          <>
            {row.balance > 0 && (
              <button
                type="button"
                className="icon-btn icon-btn-success"
                title="Confirmar que pago"
                onClick={() => openPay(row)}
              >
                <IconMoney size={16} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              title="Estado de cuenta"
              onClick={() => openProfile(row)}
            >
              <IconReceipt size={16} />
            </button>
          </>
        )}
      />

      <PaymentStatusModal
        student={statusFor}
        onClose={() => setStatusFor(null)}
        onSaved={() => {
          dispatch(fetchOverview());
          dispatch(fetchDebtors({ limit: 6 }));
        }}
      />

      {/* Confirmar el pago de toda la deuda del alumno */}
      <Modal
        open={Boolean(payFor)}
        size="sm"
        title="Registrar pago"
        onClose={() => setPayFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPayFor(null)}>
              Cancelar
            </button>
            <button type="submit" form="pay-form" className="btn btn-success" disabled={saving}>
              {saving
                ? 'Guardando...'
                : abono > 0 && abono < (payFor?.balance ?? 0)
                  ? 'Registrar abono'
                  : 'Pago completo'}
            </button>
          </>
        }
      >
        <form id="pay-form" onSubmit={confirmPay} className="form-grid">
          <ErrorBanner message={payError} onClose={() => setPayError(null)} />
          <p className="confirm-text field-span-2">
            <strong>{payFor?.fullName}</strong> tiene {payFor?.pendingCount} cobro
            {payFor?.pendingCount === 1 ? '' : 's'} abierto
            {payFor?.pendingCount === 1 ? '' : 's'} por{' '}
            <strong className="text-warning">{money(payFor?.balance)}</strong>.
          </p>
          {/* Viene con la deuda entera puesta: si paga todo basta confirmar,
              y si trae menos se escribe la cantidad. */}
          <Field
            label="Cuanto entrega"
            required
            span={2}
            hint={
              abono > 0 && abono < (payFor?.balance ?? 0)
                ? `Abono parcial: le quedarian ${money((payFor?.balance ?? 0) - abono)}`
                : 'Dejalo como esta si paga la deuda completa'
            }
          >
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={payFor?.balance}
              required
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Metodo de pago">
            <Select
              value={payForm.method}
              options={methodOptions}
              placeholder={null}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
            />
          </Field>
          <Field label="Referencia">
            <Input
              value={payForm.reference}
              onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* Estado de cuenta */}
      <Modal
        open={Boolean(profileFor)}
        size="xl"
        title={`Estado de cuenta - ${profileFor?.fullName || ''}`}
        onClose={() => setProfileFor(null)}
      >
        {loadingProfile || !profile ? (
          <Loader text="Cargando ficha..." />
        ) : (
          <div className="statement">
            <div className="stat-grid stat-grid-sm">
              <StatCard label="Total facturado" value={money(profile.summary.totalBilled)} />
              <StatCard label="Total abonado" value={money(profile.summary.totalPaid)} tone="success" />
              <StatCard
                label="Saldo pendiente"
                value={money(profile.summary.balance)}
                tone={profile.summary.balance > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="En mora"
                value={money(profile.summary.overdueBalance)}
                tone={profile.summary.overdueBalance > 0 ? 'danger' : 'default'}
              />
            </div>

            {/* La ficha es de consulta; para corregir un cobro —una referencia
                mal copiada, por ejemplo— se salta a Pagos ya filtrado por el
                alumno, que es donde vive el formulario completo. */}
            <div className="section-title section-title-row">
              <h3>Historial de cobros</h3>
              <button type="button" className="link" onClick={() => editPayments(profileFor)}>
                Editar sus cobros
              </button>
            </div>
            {profile.payments.length ? (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Recibo</th>
                      <th>Concepto</th>
                      <th>Fecha</th>
                      <th>Referencia</th>
                      <th className="align-right">Total</th>
                      <th className="align-right">Abonado</th>
                      <th className="align-right">Saldo</th>
                      <th className="align-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.payments.map((p) => (
                      <tr key={p.id}>
                        <td data-label="Recibo">{p.receiptNumber || '-'}</td>
                        <td data-label="Concepto">{p.concept}</td>
                        <td data-label="Fecha">{date(p.paymentDate || p.dueDate)}</td>
                        {/* La referencia es lo que permite casar el cobro con
                            el comprobante del banco, asi que va en la ficha. */}
                        <td data-label="Referencia">
                          <div className="cell-stack">
                            {p.reference ? (
                              <span className="ref-text">{p.reference}</span>
                            ) : (
                              <span className="muted">-</span>
                            )}
                            <small>{label('method', p.method)}</small>
                          </div>
                        </td>
                        <td data-label="Total" className="align-right">{money(p.total)}</td>
                        <td data-label="Abonado" className="align-right">{money(p.paidAmount)}</td>
                        <td data-label="Saldo" className="align-right">
                          <strong className={p.balance > 0 ? 'text-warning' : 'text-success'}>
                            {money(p.balance)}
                          </strong>
                        </td>
                        <td data-label="Estado" className="align-center">
                          <Badge value={p.status} group="paymentStatus" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Sin cobros registrados" />
            )}

            <h3 className="section-title">Trabajos realizados</h3>
            {profile.works.length ? (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Trabajo</th>
                      <th>Categoria</th>
                      <th>Entrega</th>
                      <th className="align-right">Costo</th>
                      <th className="align-right">Precio</th>
                      <th className="align-right">Margen</th>
                      <th className="align-center">Cobro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.works.map((w) => (
                      <tr key={w.id}>
                        <td data-label="Trabajo">{w.title}</td>
                        <td data-label="Categoria">{label('workCategory', w.category)}</td>
                        <td data-label="Entrega">{date(w.dueDate)}</td>
                        <td data-label="Costo" className="align-right">{money(w.totalCost)}</td>
                        <td data-label="Precio" className="align-right">{money(w.price)}</td>
                        <td data-label="Margen" className="align-right">
                          <span className={w.margin >= 0 ? 'text-success' : 'text-danger'}>
                            {money(w.margin)}
                          </span>
                        </td>
                        <td data-label="Cobro" className="align-center">
                          <Badge value={w.paymentStatus} group="workPaymentStatus" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Sin trabajos registrados" />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
