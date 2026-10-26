import { useState } from 'react';
import { useSelector } from 'react-redux';
import { teacherPaymentThunks, staffPaymentThunks } from '../store/slices/resourceSlices';
import { resourceActions } from '../store';
import PayrollSection from '../components/PayrollSection';

/* ================================================================== */
/* Nomina docente                                                      */
/* ================================================================== */

function TeachersTab() {
  const teachers = useSelector((s) => s.options.teachers);

  return (
    <PayrollSection
      sliceName="teacherPayments"
      thunks={teacherPaymentThunks}
      actions={resourceActions.teacherPayments}
      people={teachers}
      personField="teacherId"
      personNameField="teacherName"
      personKey="teacher"
      personLabel="Profesor"
      peopleFilterLabel="Todos los profesores"
      title="Nomina docente"
      subtitle="Salarios, honorarios y bonos pagados a los profesores"
      conceptPlaceholder="Nomina de septiembre"
      weeklyRateHint="Sale del profesor: alumnos x tarifa"
      payrollNote={
        'Se crea un recibo por cada profesor activo cobrando por alumno o con sueldo fijo. ' +
        'El monto son las semanas del periodo por su pago semanal. Los profesores por hora ' +
        'u honorarios se cargan manualmente.'
      }
      settleThunk={teacherPaymentThunks.settleTeacherPayment}
      voidThunk={teacherPaymentThunks.voidTeacherPayment}
      generateThunk={teacherPaymentThunks.generatePayroll}
      summaryThunk={teacherPaymentThunks.fetchPayrollSummary}
    />
  );
}

/* ================================================================== */
/* Nomina de la libreria                                               */
/* ================================================================== */

function LibraryTab() {
  const staff = useSelector((s) => s.options.staff);

  return (
    <PayrollSection
      sliceName="staffPayments"
      thunks={staffPaymentThunks}
      actions={resourceActions.staffPayments}
      people={staff}
      personField="employeeId"
      personNameField="employeeName"
      personKey="employee"
      personLabel="Trabajador"
      peopleFilterLabel="Todo el personal"
      title="Nomina de libreria"
      subtitle="Pagos al personal que atiende la libreria"
      conceptPlaceholder="Nomina de libreria de septiembre"
      weeklyRateHint="Sale del trabajador, segun lo que tenga pactado"
      payrollNote={
        'Se crea un recibo por cada trabajador activo de la libreria. El monto son las ' +
        'semanas del periodo por su pago semanal. El personal se registra en Libreria > Personal.'
      }
      defaultMethod="efectivo"
      settleThunk={staffPaymentThunks.settleStaffPayment}
      voidThunk={staffPaymentThunks.voidStaffPayment}
      generateThunk={staffPaymentThunks.generateStaffPayroll}
      summaryThunk={staffPaymentThunks.fetchStaffPayrollSummary}
    />
  );
}

/**
 * Toda la nomina en un mismo sitio. Son dos grupos con la misma regla de
 * pago, asi que se reparten en pestanias en lugar de dos secciones sueltas.
 */
export default function Payroll() {
  const [tab, setTab] = useState('docentes');

  return (
    <div className="tabbed">
      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === 'docentes' ? 'is-active' : ''}`}
          onClick={() => setTab('docentes')}
        >
          Docentes
        </button>
        <button
          type="button"
          className={`tab ${tab === 'libreria' ? 'is-active' : ''}`}
          onClick={() => setTab('libreria')}
        >
          Libreria
        </button>
      </div>

      {tab === 'docentes' ? <TeachersTab /> : <LibraryTab />}
    </div>
  );
}
