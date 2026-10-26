import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { teacherThunks } from '../store/slices/resourceSlices';
import { resourceActions } from '../store';
import { LABELS, money, num, date, label } from '../utils/format';
import { optionsFrom, Modal, Badge, Loader, StatCard, EmptyState } from '../components/ui';
import { IconEye } from '../components/Icons';
import ResourcePage from '../components/ResourcePage';

const statusOptions = optionsFrom(LABELS.teacherStatus);
const contractOptions = optionsFrom(LABELS.contractType);

export default function Teachers() {
  const dispatch = useDispatch();
  const profile = useSelector((s) => s.teachers.profile);
  const baseStudentRate = useSelector((s) => s.options.settings.baseStudentRate);
  const weeksPerMonth = useSelector((s) => s.options.settings.weeksPerMonth);
  const daysPerWeek = useSelector((s) => s.options.settings.daysPerWeek);
  const [profileFor, setProfileFor] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  /**
   * Lo que el backend calculara al guardar, mostrado en vivo mientras se
   * escribe: alumnos x tarifa da la semana, y de la semana salen el mes,
   * el dia y la hora.
   */
  const computeSalary = (values) => {
    if (values.contractType !== 'por_alumno') {
      return <span className="muted">El sueldo se escribe a mano en este tipo de contrato.</span>;
    }

    const students = Number(values.studentsCount || 0);
    const rate = Number(values.studentRate || 0);
    const hours = Number(values.weeklyHours || 0);
    const weekly = students * rate;

    return (
      <>
        <div>
          <span>A la semana</span>
          <strong>{money(weekly)}</strong>
        </div>
        <div>
          <span>Al mes ({weeksPerMonth} semanas)</span>
          <strong className="text-success">{money(weekly * weeksPerMonth)}</strong>
        </div>
        <div>
          <span>Por dia ({daysPerWeek} dias)</span>
          <strong>{daysPerWeek > 0 ? money(weekly / daysPerWeek) : money(0)}</strong>
        </div>
        <div>
          <span>Por hora</span>
          <strong>
            {hours > 0 ? money(weekly / hours) : <span className="muted">Indica las horas</span>}
          </strong>
        </div>
        <div>
          <span>Detalle</span>
          <strong className="muted" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
            {num(students, 0)} alumno{students === 1 ? '' : 's'} x {money(rate)}
          </strong>
        </div>
      </>
    );
  };

  const openProfile = async (row) => {
    setProfileFor(row);
    setLoadingProfile(true);
    await dispatch(teacherThunks.fetchTeacherProfile(row.id));
    setLoadingProfile(false);
  };

  const columns = [
    {
      key: 'fullName',
      header: 'Profesor',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.fullName || r.firstName}</strong>
          <small>{r.specialty || label('contractType', r.contractType)}</small>
        </div>
      ),
    },
    {
      key: 'studentsCount',
      header: 'Alumnos',
      align: 'center',
      render: (r) =>
        r.contractType === 'por_alumno' ? (
          <div className="cell-stack" style={{ alignItems: 'center' }}>
            <strong>{num(r.studentsCount, 0)}</strong>
            <small>x {money(r.studentRate)}</small>
          </div>
        ) : (
          <span className="muted">-</span>
        ),
    },
    {
      key: 'weeklySalary',
      header: 'A la semana',
      align: 'right',
      render: (r) =>
        Number(r.weeklySalary) > 0 ? (
          <div className="cell-stack align-right">
            <span>{money(r.weeklySalary)}</span>
            {Number(r.dailyRate) > 0 && <small>{money(r.dailyRate)} al dia</small>}
          </div>
        ) : (
          <span className="muted">-</span>
        ),
    },
    {
      key: 'monthlySalary',
      header: 'Sueldo del mes',
      align: 'right',
      render: (r) =>
        Number(r.monthlySalary) > 0 ? (
          <strong>{money(r.monthlySalary)}</strong>
        ) : (
          <span className="muted">Sin definir</span>
        ),
    },
    {
      key: 'hourlyRate',
      header: 'Por hora',
      align: 'right',
      render: (r) =>
        Number(r.hourlyRate) > 0 ? (
          <div className="cell-stack align-right">
            <span>{money(r.hourlyRate)}</span>
            {Number(r.weeklyHours) > 0 && <small>{num(r.weeklyHours, 0)} h/semana</small>}
          </div>
        ) : (
          <span className="muted">-</span>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      align: 'center',
      render: (r) => <Badge value={r.status} group="teacherStatus" />,
    },
  ];

  const formFields = [
    { name: 'firstName', label: 'Nombre', required: true },
    { name: 'lastName', label: 'Apellido' },
    { name: 'documentId', label: 'Cedula', placeholder: 'V-9876543' },
    { name: 'specialty', label: 'Especialidad', placeholder: 'Matematica' },
    { name: 'phone', label: 'Telefono' },
    { name: 'email', label: 'Correo electronico', type: 'email' },
    { name: 'address', label: 'Direccion', span: 2 },
    {
      name: 'contractType',
      label: 'Tipo de contrato',
      type: 'select',
      options: contractOptions,
      defaultValue: 'por_alumno',
      placeholder: null,
      hint: 'Define como se calcula su pago',
    },
    { name: 'hireDate', label: 'Fecha de ingreso', type: 'date' },
    {
      name: 'studentsCount',
      label: 'Cantidad de alumnos',
      type: 'number',
      step: '1',
      min: 0,
      defaultValue: 0,
      hint: 'De aqui sale el sueldo',
    },
    {
      name: 'studentRate',
      label: 'Tarifa por alumno, a la semana',
      type: 'preset-number',
      defaultValue: baseStudentRate,
      presets: [{ value: baseStudentRate, label: `Tarifa base (${money(baseStudentRate)})` }],
      customLabel: 'Otra tarifa',
    },
    {
      name: 'weeklyHours',
      label: 'Horas de clase por semana',
      type: 'number',
      step: '0.5',
      min: 0,
      defaultValue: 0,
      hint: 'Sirve para sacar la tarifa por hora',
    },
    {
      name: '__calculo',
      label: 'Lo que cobra',
      type: 'computed',
      span: 2,
      compute: computeSalary,
    },
    {
      name: 'monthlySalary',
      label: 'Salario mensual',
      type: 'number',
      defaultValue: 0,
      hint: 'Solo para contratos fijos; con "por alumno" se calcula solo',
    },
    {
      name: 'status',
      label: 'Estado',
      type: 'select',
      options: statusOptions,
      defaultValue: 'activo',
      placeholder: null,
    },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <ResourcePage
        title="Profesores"
        subtitle="Personal docente y sus condiciones de pago"
        sliceName="teachers"
        thunks={teacherThunks}
        actions={resourceActions.teachers}
        columns={columns}
        entityName="profesor"
        createLabel="Nuevo profesor"
        searchPlaceholder="Buscar por nombre, cedula o especialidad..."
        filters={[
          { key: 'status', label: 'Todos los estados', options: statusOptions },
          { key: 'contractType', label: 'Todos los contratos', options: contractOptions },
        ]}
        formFields={formFields}
        formSize="lg"
        rowActions={(row) => (
          <button type="button" className="icon-btn" title="Ver ficha" onClick={() => openProfile(row)}>
            <IconEye size={16} />
          </button>
        )}
        onRowClick={openProfile}
      />

      <Modal
        open={Boolean(profileFor)}
        size="lg"
        title={`Ficha - ${profileFor?.fullName || ''}`}
        onClose={() => setProfileFor(null)}
      >
        {loadingProfile || !profile ? (
          <Loader text="Cargando ficha..." />
        ) : (
          <div className="statement">
            <div className="stat-grid stat-grid-sm">
              <StatCard label="Devengado" value={money(profile.summary.totalAccrued)} />
              <StatCard label="Pagado" value={money(profile.summary.totalPaid)} tone="success" />
              <StatCard
                label="Pendiente"
                value={money(profile.summary.pendingBalance)}
                tone={profile.summary.pendingBalance > 0 ? 'warning' : 'success'}
              />
              <StatCard label="Recibos" value={profile.summary.paymentsCount} />
            </div>

            <h3 className="section-title">Historial de pagos</h3>
            {profile.payments.length ? (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Recibo</th>
                      <th>Concepto</th>
                      <th>Periodo</th>
                      <th>Fecha</th>
                      <th className="align-right">Total</th>
                      <th className="align-right">Saldo</th>
                      <th className="align-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.payments.map((p) => (
                      <tr key={p.id}>
                        <td data-label="Recibo">{p.receiptNumber || '-'}</td>
                        <td data-label="Concepto">{p.concept}</td>
                        <td data-label="Periodo">
                          {p.periodMonth ? `${p.periodMonth}/${p.periodYear}` : '-'}
                        </td>
                        <td data-label="Fecha">{date(p.paymentDate || p.dueDate)}</td>
                        <td data-label="Total" className="align-right">{money(p.total)}</td>
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
              <EmptyState title="Sin pagos registrados" />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
