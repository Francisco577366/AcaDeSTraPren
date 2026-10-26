import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOverview, fetchCashflow, fetchDebtors } from '../store/slices/dashboardSlice';
import { resourceActions } from '../store';
import { money, bs, num, MONTHS } from '../utils/format';
import { StatCard, Loader, BarChart, Legend, EmptyState } from '../components/ui';
import {
  IconStudent, IconTeacher, IconBook,
  IconMoney, IconWallet, IconAlert, IconTool, IconHome, IconUsers,
} from '../components/Icons';

export default function Dashboard() {
  const dispatch = useDispatch();
  const { overview, cashflow, debtors, loading } = useSelector((s) => s.dashboard);
  // El panel muestra el mes elegido en la cabecera, no siempre el actual.
  const { month, year } = useSelector((s) => s.period);
  const navigate = useNavigate();

  /** Lleva a Alumnos con los que deben algo este mes ya filtrados. */
  const verDeudoresDelMes = () => {
    dispatch(resourceActions.students.setFilter({ key: 'paymentState', value: 'con_deuda' }));
    navigate('/alumnos');
  };

  useEffect(() => {
    dispatch(fetchOverview({ month, year }));
    dispatch(fetchCashflow({ year }));
    dispatch(fetchDebtors({ limit: 6 }));
  }, [dispatch, month, year]);

  if (loading && !overview) return <Loader text="Cargando indicadores..." />;
  if (!overview) return <EmptyState title="Sin datos" hint="No se pudieron cargar los indicadores." />;

  const { counts, finance, works, library, debt, period, exchangeRate } = overview;
  const monthName = MONTHS[period.month - 1];
  const payrollDue = finance.payrollPeriodBalance;

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Panel general</h1>
          <p className="page-sub">
            Resumen de {monthName} {period.year}
          </p>
        </div>
      </header>

      {/* Un mes sin cobros emitidos sale todo en cero, y eso se lee como "no
          deben nada" cuando en realidad es "todavia no se ha emitido nada". */}
      {finance.billedCount === 0 && (
        <div className="notice">
          <IconAlert size={18} />
          <div>
            <strong>
              En {monthName} {period.year} todavia no se ha emitido ningun cobro.
            </strong>
            <p>
              Por eso las cifras del mes salen en cero: no es que nadie deba nada. Lo
              esperado serian {money(finance.expectedMonthly)} entre los {counts.students}{' '}
              alumnos activos.
            </p>
          </div>
          <Link to="/pagos" className="btn btn-primary">
            Generar mensualidades
          </Link>
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          label={`Ingresos de ${monthName}`}
          value={money(finance.incomeMonth)}
          hint="Cobrado a los alumnos"
          tone="success"
          icon={<IconMoney size={22} />}
        />
        {/* Se lee de un golpe: en rojo lo que todavia se debe de la nomina
            del mes, en verde el total cuando ya esta liquidada. */}
        <StatCard
          label={`Nomina de ${monthName}`}
          value={payrollDue > 0 ? `${money(payrollDue)}` : money(finance.payrollPeriodTotal)}
          tone={payrollDue > 0 ? 'danger' : 'success'}
          valueTone={payrollDue > 0 ? 'danger' : 'success'}
          icon={<IconWallet size={22} />}
        />
        {/* Lo que FALTA por pagar: nomina y alquiler se suman entre si, y lo
            que ya se liquido se descuenta. Cuando no queda nada, cero y verde. */}
        <StatCard
          label={`Por pagar de ${monthName}`}
          value={money(finance.toPayBalance)}
          hint={
            finance.toPayBalance > 0
              ? `${money(finance.payrollPeriodBalance)} nomina + ${money(finance.rentBalance)} alquiler`
              : `Todo pagado: ${money(finance.toPayTotal)} del mes`
          }
          tone={finance.toPayBalance > 0 ? 'danger' : 'success'}
          valueTone={finance.toPayBalance > 0 ? 'danger' : 'success'}
          icon={<IconMoney size={22} />}
        />
        {/* Lo que entro menos lo que costo. De la libreria entra su ganancia,
            no lo vendido: la mercancia ya se habia pagado. */}
        <StatCard
          label={`Ganancia de ${monthName}`}
          value={money(finance.profitMonth)}
          hint={`${money(finance.incomeMonth)} cobrado + ${money(finance.libraryProfit)} libreria - ${money(finance.toPayTotal)} gastos`}
          tone={finance.profitMonth >= 0 ? 'success' : 'danger'}
          valueTone={finance.profitMonth >= 0 ? 'success' : 'danger'}
          icon={<IconMoney size={22} />}
        />
        <StatCard
          label={`Alquiler de ${monthName}`}
          value={money(finance.rentTotal)}
          hint={
            finance.rentCount === 0
              ? 'Sin recibo emitido este mes'
              : finance.rentBalance > 0
                ? `${money(finance.rentBalance)} por pagar`
                : 'Pagado'
          }
          tone={finance.rentBalance > 0 ? 'danger' : 'success'}
          valueTone={finance.rentBalance > 0 ? 'danger' : 'success'}
          icon={<IconHome size={22} />}
        />
        {/* Los retiros no bajan la ganancia: salen de ella. Por eso la
            tarjeta dice cuanto se saco y cuanto queda. */}
        <StatCard
          label={`Retiros de ${monthName}`}
          value={money(finance.personalTotal)}
          hint={
            finance.personalCount
              ? `${finance.personalCount} retiro(s) - queda ${money(finance.profitAfterPersonal)} de la ganancia`
              : 'Nada retirado este mes'
          }
          tone="info"
          icon={<IconUsers size={22} />}
        />
        {/* Dos deudas distintas, y hacen falta las dos: la del mes dice a
            quien hay que cobrarle ahora; la acumulada, cuanto se arrastra. */}
        <StatCard
          label={`Por cobrar de ${monthName}`}
          value={money(finance.billedCount ? finance.debtPeriod : finance.expectedMonthly)}
          hint={
            finance.billedCount === 0
              ? `Estimado: ${counts.students} alumnos activos. Sin emitir todavia`
              : finance.debtorsPeriod > 0
                ? `${finance.debtorsPeriod} alumno(s) por pagar - de ${money(finance.billedPeriod)} emitidos`
                : `Todo cobrado: ${money(finance.billedPeriod)} del mes`
          }
          tone={
            finance.billedCount === 0
              ? 'info'
              : finance.debtPeriod > 0
                ? 'warning'
                : 'success'
          }
          icon={<IconAlert size={22} />}
          action={
            finance.debtorsPeriod > 0 && (
              <button type="button" className="link" onClick={verDeudoresDelMes}>
                Ver quien debe
              </button>
            )
          }
        />
        <StatCard
          label="Deuda acumulada"
          value={money(debt.total)}
          hint={
            debt.overdue > 0
              ? `${money(debt.overdue)} vencido - de todos los meses, no solo ${monthName}`
              : 'De todos los meses, no solo este'
          }
          tone={debt.total > 0 ? 'warning' : 'success'}
          icon={<IconAlert size={22} />}
        />
      </div>

      <div className="stat-grid stat-grid-sm">
        <StatCard label="Alumnos activos" value={num(counts.students, 0)} icon={<IconStudent size={20} />} />
        <StatCard label="Profesores" value={num(counts.teachers, 0)} icon={<IconTeacher size={20} />} />
        <StatCard label="Trabajos" value={num(counts.works, 0)} icon={<IconTool size={20} />} />
        <StatCard
          label="Deuda de trabajos"
          value={money(debt.works)}
          hint={`${debt.worksCount} trabajo(s) por cobrar`}
          tone={debt.works > 0 ? 'warning' : 'default'}
          icon={<IconTool size={20} />}
        />
        <StatCard
          label="Libreria del mes"
          value={bs(library.paid)}
          hint={`${library.salesCount} venta(s) - la libreria cobra en bolivares`}
          tone="info"
          icon={<IconBook size={20} />}
        />
        <StatCard
          label="Alumnos pago faltante"
          value={num(debt.overdueStudents, 0)}
          hint={debt.overdue > 0 ? `${money(debt.overdue)} vencido` : 'Ninguno'}
          tone={debt.overdueStudents > 0 ? 'danger' : 'default'}
          icon={<IconAlert size={20} />}
        />
      </div>

      {/* El calculo del mes abierto en canal: lo que entro, lo que salio y lo
          que queda. Va a todo lo ancho y con la suma delante, porque asi la
          cifra final no hay que creersela: se comprueba. */}
      <div className="card">
        <div className="card-head">
          <h2>
            Cuentas de {monthName} {period.year}
          </h2>
          <Link to="/personales" className="link">
            Ver retiros
          </Link>
        </div>

        <div className="result-split">
          <div>
            <p className="result-col-title">Lo que se genero</p>
            <div className="mini-stats">
              <div>
                <span>Cobrado a los alumnos</span>
                <strong className="text-success">{money(finance.incomeMonth)}</strong>
              </div>
              <div>
                <span>Ganancia de la libreria</span>
                <strong className="text-success">{money(finance.libraryProfit)}</strong>
              </div>
              <div className="mini-stats-total">
                <span>Total generado</span>
                <strong className="text-success">{money(finance.generatedMonth)}</strong>
              </div>
            </div>
          </div>

          <div>
            <p className="result-col-title">Lo que se gasto</p>
            <div className="mini-stats">
              <div>
                <span>Nomina (profesores y libreria)</span>
                <strong>{money(finance.payrollPeriodTotal)}</strong>
              </div>
              <div>
                <span>Alquiler</span>
                <strong>{money(finance.rentTotal)}</strong>
              </div>
              <div>
                <span>Pagos personales (retiros)</span>
                <strong>{money(finance.personalTotal)}</strong>
              </div>
              <div className="mini-stats-total">
                <span>Total de gastos</span>
                <strong className="text-danger">{money(finance.expensesMonth)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`result-net ${finance.netMonth >= 0 ? 'result-net-good' : 'result-net-bad'}`}
        >
          <span className="result-net-label">
            <strong>Neto de {monthName}</strong>
            <small>
              {money(finance.generatedMonth)} generado - {money(finance.expensesMonth)} de gastos
              {finance.netMonth < 0 && ' - se gasto mas de lo que entro'}
            </small>
          </span>
          <span
            className={`result-net-value ${finance.netMonth >= 0 ? 'text-success' : 'text-danger'}`}
          >
            {money(finance.netMonth)}
          </span>
        </div>

        {/* La libreria cobra en bolivares: hay que decir con que tasa entro su
            parte, o la suma de arriba no se puede comprobar a mano. */}
        {finance.libraryProfitBs > 0 && (
          <p className="muted footnote">
            {exchangeRate?.rate
              ? `De la libreria entra su ganancia, no lo vendido: la mercancia ya estaba
                 pagada. Son ${bs(finance.libraryProfitBs)} convertidos a la tasa BCV de
                 ${bs(exchangeRate.rate)} por dolar.`
              : `Sin tasa del BCV disponible, los ${bs(finance.libraryProfitBs)} de ganancia
                 de la libreria quedan fuera de este calculo.`}
          </p>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Flujo del anio {cashflow?.year}</h2>
            {/* La serie de nomina solo viene si quien mira es administrador;
                la leyenda tiene que decir lo que de verdad se esta dibujando. */}
            <Legend
              items={[
                { label: 'Ingresos', color: 'var(--accent-success)' },
                ...(cashflow?.conNomina
                  ? [{ label: 'Nomina', color: 'var(--accent-info)' }]
                  : []),
              ]}
            />
          </div>
          {cashflow ? (
            <BarChart
              data={cashflow.series}
              keys={cashflow.conNomina ? ['ingresos', 'egresos'] : ['ingresos']}
              colors={['var(--accent-success)', 'var(--accent-info)']}
              formatValue={(v) => num(v, 0)}
            />
          ) : (
            <Loader />
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>De que se compone la deuda acumulada</h2>
            <Link to="/pagos" className="link">
              Ir a pagos
            </Link>
          </div>
          <div className="mini-stats">
            <div>
              <span>Mensualidades y cobros</span>
              <strong>
                {money(debt.payments)}
                <small className="muted"> ({debt.paymentsCount})</small>
              </strong>
            </div>
            <div>
              <span>Ventas de libreria</span>
              <strong>
                {bs(debt.libraryBs)}
                <small className="muted"> ({debt.libraryCount})</small>
              </strong>
            </div>
            <div>
              <span>Trabajos sin facturar</span>
              <strong>
                {money(debt.works)}
                <small className="muted"> ({debt.worksCount})</small>
              </strong>
            </div>
            <div>
              <span>Alumnos con pago vencido</span>
              <strong className={debt.overdue > 0 ? 'text-danger' : 'text-success'}>
                {money(debt.overdue)}
                <small className="muted"> ({debt.overdueStudents})</small>
              </strong>
            </div>
            <div className="mini-stats-total">
              <span>Deuda total</span>
              <strong className={debt.total > 0 ? 'text-warning' : 'text-success'}>
                {money(debt.total)}
              </strong>
            </div>
          </div>
          {/* El total va en la moneda base, asi que hay que decir que se hizo
              con la parte de la libreria, que esta en bolivares. */}
          {debt.libraryBs > 0 && (
            <p className="muted footnote">
              {debt.libraryConverted
                ? `La libreria cobra en bolivares: sus ${bs(debt.libraryBs)} entran al total
                   convertidos a la tasa BCV de ${bs(exchangeRate?.rate)} por dolar.`
                : `Sin tasa del BCV disponible, los ${bs(debt.libraryBs)} de la libreria
                   quedan fuera de este total.`}
            </p>
          )}
        </div>

      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Alumnos con mayor saldo</h2>
            <Link to="/pagos" className="link">
              Ir a pagos
            </Link>
          </div>
          {debtors.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Grado</th>
                    <th className="align-center">Recibos</th>
                    <th className="align-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d) => (
                    <tr key={d.studentId}>
                      <td data-label="Alumno">{d.name}</td>
                      <td data-label="Grado">{d.grade || '-'}</td>
                      <td data-label="Recibos" className="align-center">{d.pendingCount}</td>
                      <td data-label="Saldo" className="align-right text-danger">
                        <strong>{money(d.balance)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Sin deudas pendientes" hint="Todos los cobros estan al dia." />
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Rentabilidad de trabajos</h2>
            <Link to="/trabajos" className="link">
              Ver todos
            </Link>
          </div>
          <div className="mini-stats">
            <div>
              <span>Costo incurrido</span>
              <strong>{money(works.cost)}</strong>
            </div>
            <div>
              <span>Facturado</span>
              <strong>{money(works.billed)}</strong>
            </div>
            <div>
              <span>Cobrado</span>
              <strong className="text-success">{money(works.paid)}</strong>
            </div>
            <div>
              <span>Por cobrar</span>
              <strong className="text-warning">{money(works.pending)}</strong>
            </div>
            <div className="mini-stats-total">
              <span>Margen acumulado</span>
              <strong className={works.margin >= 0 ? 'text-success' : 'text-danger'}>
                {money(works.margin)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
