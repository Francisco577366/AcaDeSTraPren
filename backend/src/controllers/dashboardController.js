const asyncHandler = require('../utils/asyncHandler');
const { currentPeriod } = require('../utils/today');
const { round2 } = require('../utils/money');
const env = require('../config/env');
const { getRate } = require('../services/exchangeRate');
const { recortarPanel, esAdmin } = require('../config/roles');
const { conFiltro } = require('../models/plugins/demo');
const {
  Student, Teacher, Payment, Sale, StudentWork,
  TeacherPayment, EmployeePayment, RentPayment, PersonalPayment,
} = require('../models');

const MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/** Devuelve la primera fila de una agregacion, o un objeto vacio. */
const una = async (promesa) => (await promesa)[0] || {};

/**
 * Las dos nominas se consultan juntas. La docente y la de la libreria tienen
 * la misma forma, asi que lo que el panel llama "nomina" es la union: lo que
 * se paga a profesores mas lo que se paga al personal de la libreria.
 *
 * $unionWith hace aqui lo que hacia el UNION ALL: recorre las dos colecciones
 * como si fueran una sola antes de agrupar.
 */
const nomina = (filtro, grupo) => TeacherPayment.aggregate([
  { $match: filtro },
  // conFiltro: el sub-pipeline de un $unionWith no pasa por los hooks del
  // modelo, asi que la separacion entre la academia y la visita hay que
  // escribirla aqui. Sin esto, la nomina del personal se mezclaria.
  { $unionWith: { coll: EmployeePayment.collection.name, pipeline: [{ $match: conFiltro(filtro) }] } },
  { $group: { _id: null, ...grupo } },
]);

/** El neto de un recibo de nomina: monto mas bono menos deducciones. */
const NOMINA_NETO = { $subtract: [{ $add: ['$amount', '$bonus'] }, '$deductions'] };
const NOMINA_SALDO = {
  $subtract: [{ $add: ['$amount', '$bonus'] }, { $add: ['$deductions', '$paidAmount'] }],
};

/**
 * Indicadores generales de la academia: conteos, caja del mes,
 * cuentas por cobrar, nomina pendiente y rentabilidad de trabajos.
 */
const overview = asyncHandler(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || currentPeriod().year;
  const month = Number(req.query.month) || currentPeriod().month;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const range = { from: monthStart, to: monthEnd };

  const [
    students,
    teachers,
    income,
    receivables,
    overdue,
    payroll,
    payrollPeriod,
    payrollPending,
    works,
    library,
    libraryPending,
    worksPending,
    expected,
    overdueStudents,
    rentPeriod,
    personalPeriod,
    billedPeriod,
  ] = await Promise.all([
    Student.countDocuments({ status: 'activo' }),
    Teacher.countDocuments({ status: 'activo' }),
    // Lo cobrado a los alumnos dentro del mes, por fecha de pago.
    una(Payment.aggregate([
      { $match: { status: { $ne: 'anulado' }, paymentDate: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ])),
    // Todo lo que se debe, de cualquier mes.
    una(Payment.aggregate([
      { $match: { status: { $in: ['pendiente', 'parcial', 'vencido'] } } },
      { $group: { _id: null, balance: { $sum: Payment.SALDO }, count: { $sum: 1 } } },
    ])),
    una(Payment.aggregate([
      { $match: { status: 'vencido' } },
      { $group: { _id: null, balance: { $sum: Payment.SALDO }, count: { $sum: 1 } } },
    ])),
    // Lo que se pago de nomina dentro del mes.
    una(nomina(
      { status: { $ne: 'anulado' }, paymentDate: { $gte: monthStart, $lte: monthEnd } },
      { total: { $sum: '$paidAmount' } }
    )),
    // Lo que devenga la nomina del periodo, este pagado o no.
    una(nomina(
      { status: { $ne: 'anulado' }, periodMonth: month, periodYear: year },
      { total: { $sum: NOMINA_NETO }, paid: { $sum: '$paidAmount' }, count: { $sum: 1 } }
    )),
    una(nomina(
      { status: { $in: ['pendiente', 'parcial'] } },
      { balance: { $sum: NOMINA_SALDO }, count: { $sum: 1 } }
    )),
    una(StudentWork.aggregate([
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          cost: { $sum: { $add: ['$materialCost', '$laborCost'] } },
          price: { $sum: '$price' },
          paid: { $sum: '$paidAmount' },
        },
      },
    ])),
    una(Sale.aggregate([
      { $match: { status: { $ne: 'anulado' }, saleDate: { $gte: monthStart, $lte: monthEnd } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          paid: { $sum: '$paidAmount' },
          total: { $sum: Sale.TOTAL },
          cost: { $sum: '$cost' },
        },
      },
    ])),
    una(Sale.aggregate([
      { $match: { status: { $in: ['pendiente', 'parcial'] } } },
      { $group: { _id: null, balance: { $sum: Sale.SALDO }, count: { $sum: 1 } } },
    ])),
    /*
     * Trabajos con saldo que todavia no se han facturado como cobro: si ya
     * tienen un pago enlazado, la deuda vive alli y contarla aqui la
     * duplicaria. El NOT EXISTS pasa a ser un lookup que se queda solo con
     * los que no encontraron pareja.
     */
    una(StudentWork.aggregate([
      { $match: { $expr: { $gt: ['$price', '$paidAmount'] } } },
      {
        $lookup: {
          from: Payment.collection.name,
          let: { trabajo: '$id' },
          pipeline: [
            {
              $match: conFiltro({
                $expr: { $eq: ['$studentWorkId', '$$trabajo'] },
                status: { $ne: 'anulado' },
              }),
            },
            { $limit: 1 },
          ],
          as: 'cobros',
        },
      },
      { $match: { cobros: { $size: 0 } } },
      {
        $group: {
          _id: null,
          balance: { $sum: { $subtract: ['$price', '$paidAmount'] } },
          count: { $sum: 1 },
        },
      },
    ])),
    una(Student.aggregate([
      { $match: { status: 'activo' } },
      { $group: { _id: null, total: { $sum: '$monthlyFee' } } },
    ])),
    // Cuantos alumnos distintos tienen algun cobro vencido.
    una(Payment.aggregate([
      { $match: { status: 'vencido' } },
      { $group: { _id: '$studentId' } },
      { $count: 'total' },
    ])),
    // El alquiler del periodo, separado por moneda porque puede pactarse
    // en dolares o en bolivares.
    RentPayment.aggregate([
      { $match: { status: { $ne: 'anulado' }, periodMonth: month, periodYear: year } },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' },
          paid: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
    // Lo retirado para gastos personales en el mes, por moneda.
    PersonalPayment.aggregate([
      { $match: { paymentDate: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    /*
     * Cuanto se le facturo a los alumnos EN ESE PERIODO. Sirve para separar
     * "nadie debe nada" de "todavia no se ha emitido nada", que en un panel
     * lleno de ceros son cosas muy distintas.
     *
     * Los deudores se cuentan sin repetir: primero se agrupa por alumno y se
     * mira si le queda saldo, y despues se cuentan los que si.
     */
    una(Payment.aggregate([
      { $match: { status: { $ne: 'anulado' }, periodMonth: month, periodYear: year } },
      {
        $group: {
          _id: '$studentId',
          count: { $sum: 1 },
          total: { $sum: Payment.TOTAL },
          paid: { $sum: '$paidAmount' },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: '$count' },
          total: { $sum: '$total' },
          paid: { $sum: '$paid' },
          debtors: { $sum: { $cond: [{ $gt: [{ $subtract: ['$total', '$paid'] }, 0] }, 1, 0] } },
        },
      },
    ])),
  ]);


  const incomeMonth = round2(income.total);
  const payrollMonth = round2(payroll.total);
  const payrollPeriodTotal = round2(payrollPeriod.total);
  const payrollPeriodPaid = round2(payrollPeriod.paid);
  const libraryPaid = round2(library.paid);
  const libraryTotal = round2(library.total);

  // La deuda total suma lo que se debe por cobros, por ventas de libreria y
  // por trabajos que aun no se han facturado. La libreria cobra en bolivares,
  // asi que su parte se pasa a la moneda base con la tasa del BCV antes de
  // sumarla; sin tasa se deja fuera y se avisa, que es mejor que sumar peras
  // con manzanas.
  const exchangeRate = await getRate();

  // El alquiler del mes, todo en la moneda base: lo pactado en bolivares se
  // pasa con la tasa del BCV para que sume junto al resto del resultado.
  const toBase = (amount, currency) =>
    currency === 'VES' ? (exchangeRate.rate ? Number(amount) / exchangeRate.rate : 0) : Number(amount);

  const rentTotal = round2(rentPeriod.reduce((a, r) => a + toBase(r.total, r._id), 0));
  const rentPaid = round2(rentPeriod.reduce((a, r) => a + toBase(r.paid, r._id), 0));
  const rentCount = rentPeriod.reduce((a, r) => a + Number(r.count || 0), 0);
  const rentBalance = round2(rentTotal - rentPaid);
  const payrollPeriodBalance = round2(payrollPeriodTotal - payrollPeriodPaid);

  /*
   * Ganancia del mes: lo que entro menos lo que costo.
   *
   * De la libreria entra su GANANCIA, no lo vendido: la mercancia se pago
   * antes y contarla entera inflaria el resultado. Como la libreria cobra en
   * bolivares, esa parte se pasa a la moneda base con la tasa del BCV.
   */
  const libraryProfitBs = round2(libraryTotal - Number(library.cost || 0));
  const libraryProfit = exchangeRate.rate ? round2(libraryProfitBs / exchangeRate.rate) : 0;
  const profitMonth = round2(incomeMonth + libraryProfit - payrollPeriodTotal - rentTotal);

  /*
   * Lo retirado para gastos personales NO entra en la ganancia: no es un
   * gasto del negocio sino un reparto de lo que gano. Por eso va aparte, y
   * lo que queda es la ganancia menos esos retiros.
   */
  const personalTotal = round2(personalPeriod.reduce((a, r) => a + toBase(r.total, r._id), 0));
  const personalCount = personalPeriod.reduce((a, r) => a + Number(r.count || 0), 0);
  const profitAfterPersonal = round2(profitMonth - personalTotal);

  /*
   * El calculo completo del mes, para poder mostrarlo entero:
   *
   *   generado  = cobrado a los alumnos + ganancia de la libreria
   *   gastos    = nomina + alquiler + pagos personales
   *   neto      = generado - gastos
   *
   * El neto da lo mismo que profitAfterPersonal, pero llegando por el otro
   * lado: aqui se agrupan primero TODOS los gastos, que es como se lee el
   * calculo. La ganancia de arriba sigue siendo la del negocio y no baja por
   * los retiros; esta es la plata que queda de verdad en la caja.
   */
  const generatedMonth = round2(incomeMonth + libraryProfit);
  const expensesMonth = round2(payrollPeriodTotal + rentTotal + personalTotal);
  const netMonth = round2(generatedMonth - expensesMonth);

  const debtPayments = round2(receivables.balance);
  const debtLibraryBs = round2(libraryPending.balance);
  const debtLibrary = exchangeRate.rate ? round2(debtLibraryBs / exchangeRate.rate) : 0;
  const debtWorks = round2(worksPending.balance);
  const worksCost = round2(works.cost);
  const worksPrice = round2(works.price);
  const worksPaid = round2(works.paid);

  /*
   * El panel se recorta segun el rol ANTES de salir.
   *
   * Reservar la ruta de pagos personales no basta: aqui mismo viajan el total
   * retirado, la ganancia del mes y los sueldos de la nomina, que es la misma
   * informacion por otra puerta. Lo que se oculta hay que ocultarlo en todas.
   */
  const data = {
      period: { year, month, monthStart, monthEnd },
      counts: {
        students,
        teachers,
        works: Number(works.count || 0),
      },
      finance: {
        incomeMonth,
        payrollMonth,
        payrollPeriodTotal,
        payrollPeriodPaid,
        payrollPeriodBalance,
        payrollPeriodCount: Number(payrollPeriod.count || 0),
        rentTotal,
        rentPaid,
        rentBalance,
        rentCount,
        // Lo que hay que pagar en el mes. La nomina y el alquiler NO se restan
        // de lo cobrado: se suman entre si, porque lo que interesa es cuanto
        // dinero hay que sacar. Va sobre lo devengado del periodo, este
        // liquidado o no: lo que cuesta un mes no depende del dia de pago.
        toPayTotal: round2(payrollPeriodTotal + rentTotal),
        toPayBalance: round2(payrollPeriodBalance + rentBalance),
        billedPeriod: round2(billedPeriod.total),
        billedPaid: round2(billedPeriod.paid),
        billedCount: Number(billedPeriod.count || 0),
        // Lo que falta por cobrar DE ESE MES, y a cuantos alumnos.
        debtPeriod: round2(Number(billedPeriod.total || 0) - Number(billedPeriod.paid || 0)),
        debtorsPeriod: Number(billedPeriod.debtors || 0),
        profitMonth,
        libraryProfit,
        libraryProfitBs,
        personalTotal,
        personalCount,
        profitAfterPersonal,
        // El calculo del mes abierto en sus tres piezas.
        generatedMonth,
        expensesMonth,
        netMonth,
        receivables: round2(receivables.balance),
        receivablesCount: Number(receivables.count || 0),
        overdue: round2(overdue.balance),
        overdueCount: Number(overdue.count || 0),
        payrollPending: round2(payrollPending.balance),
        payrollPendingCount: Number(payrollPending.count || 0),
        expectedMonthly: round2(expected.total),
      },
      debt: {
        total: round2(debtPayments + debtLibrary + debtWorks),
        payments: debtPayments,
        paymentsCount: Number(receivables.count || 0),
        overdue: round2(overdue.balance),
        overdueCount: Number(overdue.count || 0),
        library: debtLibrary,
        libraryBs: debtLibraryBs,
        libraryCount: Number(libraryPending.count || 0),
        // Cuando no hay tasa la libreria no entra en el total.
        libraryConverted: Boolean(exchangeRate.rate),
        works: debtWorks,
        worksCount: Number(worksPending.count || 0),
        overdueStudents: Number(overdueStudents.total || 0),
      },
      works: {
        count: Number(works.count || 0),
        cost: worksCost,
        billed: worksPrice,
        paid: worksPaid,
        pending: round2(worksPrice - worksPaid),
        margin: round2(worksPrice - worksCost),
      },
      library: {
        salesCount: Number(library.count || 0),
        total: libraryTotal,
        paid: libraryPaid,
        pending: round2(libraryTotal - libraryPaid),
        profit: libraryProfitBs,
        currency: env.libraryCurrency,
      },
      exchangeRate,
  };

  res.json({ success: true, data: recortarPanel(data, req.user) });
});

/** Serie mensual de ingresos contra nomina para graficar el anio. */
const cashflow = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || currentPeriod().year;
  const range = { from: `${year}-01-01`, to: `${year}-12-31` };

  const delAnio = {
    status: { $ne: 'anulado' },
    paymentDate: { $gte: range.from, $lte: range.to },
  };
  // El mes sale del texto de la fecha, que es aaaa-mm-dd.
  const PorMes = {
    _id: { $toInt: { $substr: ['$paymentDate', 5, 2] } },
    total: { $sum: '$paidAmount' },
  };

  const [income, expense] = await Promise.all([
    Payment.aggregate([{ $match: delAnio }, { $group: PorMes }]),
    TeacherPayment.aggregate([
      { $match: delAnio },
      { $unionWith: { coll: EmployeePayment.collection.name, pipeline: [{ $match: conFiltro(delAnio) }] } },
      { $group: PorMes },
    ]),
  ]);

  /*
   * Los egresos de esta serie SON la nomina pagada mes a mes, asi que no
   * pueden salir para quien no es administrador: la nomina esta cerrada en su
   * propia ruta y en el panel, y publicarla aqui seria dejarla entrar por la
   * ventana. Quien no lo es ve solo lo que entro, que es su trabajo.
   */
  const conNomina = esAdmin(req.user);

  const series = Array.from({ length: 12 }, (_, i) => {
    const inc = income.find((r) => Number(r._id) === i + 1);
    const exp = expense.find((r) => Number(r._id) === i + 1);
    const ingresos = inc ? round2(inc.total) : 0;
    const egresos = exp ? round2(exp.total) : 0;

    const mes = { month: i + 1, label: MONTHS[i], ingresos };
    if (conNomina) {
      mes.egresos = egresos;
      mes.neto = round2(ingresos - egresos);
    }
    return mes;
  });

  res.json({ success: true, data: { year, series, conNomina } });
});

module.exports = { overview, cashflow };
