/* eslint-disable no-console */
/**
 * Prueba la API entera contra MongoDB: alta de alumnos, cobros, ventas,
 * nomina, panel, roles y actividad.
 *
 * Usa una base de pruebas aparte y la borra al terminar. Requiere el Mongo
 * local levantado (docker compose up -d mongo).
 *
 *   npm run probar:api
 */
const BASE_DB = process.env.DB_NAME || 'academia_e2e';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/?directConnection=true';
process.env.DB_NAME = BASE_DB;
process.env.NODE_ENV = 'development';
process.env.SEED_ON_START = 'false';
process.env.AUTO_MONTHLY_CHARGES = 'false';
process.env.JWT_SECRET = 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b';
process.env.ADMIN_EMAIL = 'admin@academia.com';
process.env.ADMIN_PASSWORD = 'Clave-Admin-Larga-2026';
process.env.USUARIO_EMAIL = 'usuario@academia.com';
process.env.USUARIO_PASSWORD = 'Clave-Usuario-Larga-2026';
process.env.BASE_MONTHLY_FEE = '70';
process.env.RATE_LIMIT_MAX = '5000';

const { connectWithRetry, mongoose } = require('../src/config/database');
const app = require('../src/app');
const { run } = require('../src/seed/bootstrap');

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  OK   ' : '  FALLA') + ' ' + t); if (!c) fallos += 1; };

const PUERTO = 4777;
const API = `http://127.0.0.1:${PUERTO}/api`;
let tokenAdmin = null;
let tokenUsuario = null;

/** Llamada al API con el token indicado. */
async function pedir(ruta, { metodo = 'GET', body, token = tokenAdmin } = {}) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let datos = null;
  try { datos = await r.json(); } catch { datos = null; }
  return { estado: r.status, datos, cuerpo: datos?.data };
}

(async () => {
  await connectWithRetry(5, 1000);
  // Base limpia en cada pasada: una prueba que arrastra datos de la anterior
  // deja de medir lo que dice medir.
  await mongoose.connection.dropDatabase();
  await run({ silent: true });

  const servidor = app.listen(PUERTO);

  try {
    console.log('\n1. Entrar');
    let r = await pedir('/auth/login', {
      metodo: 'POST', token: null,
      body: { email: 'admin@academia.com', password: 'Clave-Admin-Larga-2026' },
    });
    ok(r.estado === 200 && !!r.cuerpo?.token, `el administrador entra (${r.estado})`);
    tokenAdmin = r.cuerpo?.token;
    ok(r.cuerpo?.user?.role === 'admin', `con rol ${r.cuerpo?.user?.role}`);
    ok(!('password' in (r.cuerpo?.user || {})), 'y la respuesta no trae la contrasena');

    r = await pedir('/auth/login', {
      metodo: 'POST', token: null,
      body: { email: 'usuario@academia.com', password: 'Clave-Usuario-Larga-2026' },
    });
    tokenUsuario = r.cuerpo?.token;
    ok(r.estado === 200 && r.cuerpo?.user?.role === 'usuario', `la secretaria entra con rol ${r.cuerpo?.user?.role}`);

    r = await pedir('/auth/login', {
      metodo: 'POST', token: null,
      body: { email: 'admin@academia.com', password: 'equivocada' },
    });
    ok(r.estado === 401, `una clave mala no entra (${r.estado})`);

    console.log('\n2. Alumnos y sus primeros cobros');
    r = await pedir('/students', {
      metodo: 'POST',
      body: { firstName: 'Ana', lastName: 'Lugo', monthlyFee: 70, monthlyCharge: 'pendiente', enrollmentCharge: 'pagado', enrollmentFee: 30 },
    });
    ok(r.estado === 201, `se inscribe un alumno (${r.estado})`);
    const alumno = r.cuerpo?.id;
    ok(alumno === 1, `con id numerico correlativo (${alumno})`);

    r = await pedir('/payments?limit=50');
    const cobros = r.cuerpo || [];
    ok(cobros.length === 2, `el alta emitio sus 2 cobros (${cobros.length})`);
    const mens = cobros.find((c) => c.conceptType === 'mensualidad');
    // Vence el dia 5: antes de esa fecha es 'pendiente' y despues 'vencido'.
    // Las dos son correctas; lo que NO puede es salir pagada sin haber pagado.
    ok(['pendiente', 'vencido'].includes(mens?.status), `la mensualidad sale sin pagar (${mens?.status}, vence ${mens?.dueDate})`);
    ok(cobros.some((c) => c.conceptType === 'inscripcion' && c.status === 'pagado'), 'la inscripcion queda pagada');
    ok(cobros.every((c) => /^REC-\d{6}$/.test(c.receiptNumber)), `con recibos correlativos (${cobros.map((c) => c.receiptNumber).join(', ')})`);
    ok(cobros.every((c) => c.studentName === 'Ana Lugo'), 'y el nombre del alumno resuelto');

    console.log('\n3. Cobrar');
    const mensualidad = cobros.find((c) => c.conceptType === 'mensualidad');
    r = await pedir(`/payments/${mensualidad.id}/settle`, { metodo: 'POST', body: { amount: 30 } });
    ok(r.estado === 200 && r.cuerpo?.status === 'parcial', `un abono parcial deja el cobro en ${r.cuerpo?.status}`);
    ok(!!r.cuerpo?.paymentDate, 'y sella la fecha, para que entre en la caja del mes');

    r = await pedir(`/payments/${mensualidad.id}/settle`, { metodo: 'POST', body: { amount: 40 } });
    ok(r.cuerpo?.status === 'pagado' && r.cuerpo?.balance === 0, 'el resto lo deja pagado y sin saldo');

    r = await pedir(`/payments/${mensualidad.id}/settle`, { metodo: 'POST', body: { amount: 10 } });
    ok(r.estado === 400, `no deja cobrar de mas (${r.estado})`);

    console.log('\n4. Libreria: una venta descuenta stock');
    r = await pedir('/library/products', { metodo: 'POST', body: { name: 'Resma', cost: 100, price: 150, stock: 10 } });
    const producto = r.cuerpo?.id;
    ok(r.estado === 201, `se crea un producto (${r.estado})`);

    r = await pedir('/library/sales', { metodo: 'POST', body: { items: [{ productId: producto, quantity: 3 }], paidAmount: 450 } });
    ok(r.estado === 201, `se registra una venta (${r.estado})`);
    ok(r.cuerpo?.total === 450 && r.cuerpo?.itemsCount === 3, `por ${r.cuerpo?.total} y ${r.cuerpo?.itemsCount} unidades`);

    r = await pedir(`/library/products/${producto}`);
    ok(r.cuerpo?.stock === 7, `el stock bajo de 10 a ${r.cuerpo?.stock}`);

    // La transaccion: si falla a mitad, no debe quedar nada a medias.
    r = await pedir('/library/sales', { metodo: 'POST', body: { items: [{ productId: producto, quantity: 2 }, { productId: producto, quantity: 99 }] } });
    ok(r.estado === 400, `una venta sin stock se rechaza (${r.estado})`);
    r = await pedir(`/library/products/${producto}`);
    ok(r.cuerpo?.stock === 7, `y NO descuenta nada: el stock sigue en ${r.cuerpo?.stock} (la transaccion se deshizo)`);

    console.log('\n5. Nomina');
    r = await pedir('/teachers', { metodo: 'POST', body: { firstName: 'Luis', contractType: 'por_alumno', studentsCount: 10, studentRate: 5 } });
    ok(r.cuerpo?.weeklySalary === 50, `el sueldo semanal se calcula solo: ${r.cuerpo?.weeklySalary}`);

    r = await pedir('/teacher-payments/generate-payroll', { metodo: 'POST', body: { month: 10, year: 2026, weeks: 4 } });
    ok(r.estado === 201 && r.cuerpo?.created === 1, `se genera la nomina (${r.cuerpo?.created} recibo)`);

    r = await pedir('/teacher-payments?limit=10');
    const nomina = (r.cuerpo || [])[0];
    ok(nomina?.amount === 200, `4 semanas x 50 = ${nomina?.amount}`);
    ok(nomina?.teacherName === 'Luis', `a nombre de ${nomina?.teacherName}`);
    ok(/^NOM-\d{6}$/.test(nomina?.receiptNumber || ''), `con recibo ${nomina?.receiptNumber}`);

    console.log('\n6. El panel cuadra');
    r = await pedir('/dashboard/overview?month=10&year=2026');
    const f = r.cuerpo?.finance;
    ok(r.estado === 200, `el panel responde (${r.estado})`);
    ok(f?.incomeMonth === 100, `cobrado: 30 inscripcion + 70 mensualidad = ${f?.incomeMonth}`);
    ok(f?.payrollPeriodTotal === 200, `nomina devengada: ${f?.payrollPeriodTotal}`);
    ok(f?.billedPeriod === 100 && f?.billedPaid === 100, `facturado ${f?.billedPeriod}, cobrado ${f?.billedPaid}`);
    ok(f?.debtPeriod === 0 && f?.debtorsPeriod === 0, 'nadie debe nada del mes');
    ok(Math.abs((f?.billedPaid + f?.debtPeriod) - f?.billedPeriod) < 0.01, 'cobrado + por cobrar = facturado');
    ok(Math.abs((f?.generatedMonth - f?.expensesMonth) - f?.netMonth) < 0.01,
      `generado ${f?.generatedMonth} - gastos ${f?.expensesMonth} = neto ${f?.netMonth}`);
    ok(r.cuerpo?.library?.salesCount === 1, `la libreria cuenta su venta (${r.cuerpo?.library?.salesCount})`);

    r = await pedir('/dashboard/cashflow?year=2026');
    const oct = (r.cuerpo?.series || []).find((m) => m.month === 10);
    ok(oct?.ingresos === 100 && oct?.egresos === 0, `el flujo del anio: octubre ${oct?.ingresos} de ingresos`);

    console.log('\n7. Cobranza por alumno');
    r = await pedir('/students?periodMonth=10&periodYear=2026');
    ok(r.cuerpo?.[0]?.paymentState === 'al_dia', `Ana sale ${r.cuerpo?.[0]?.paymentState} en octubre`);
    r = await pedir('/students?periodMonth=11&periodYear=2026');
    ok(r.cuerpo?.[0]?.paymentState === 'sin_emitir', `y ${r.cuerpo?.[0]?.paymentState} en noviembre, que no se ha emitido`);
    r = await pedir('/students/debtors');
    ok(Array.isArray(r.cuerpo) && r.cuerpo.length === 0, 'no hay deudores');

    console.log('\n8. Los roles, contra la base de verdad');
    const cerradas = [
      ['/personal-payments', 'los retiros personales'],
      ['/rent', 'el alquiler'],
      ['/teacher-payments', 'la nomina'],
      ['/auth/users', 'los usuarios'],
    ];
    for (const [ruta, que] of cerradas) {
      const u = await pedir(ruta, { token: tokenUsuario });
      const a = await pedir(ruta, { token: tokenAdmin });
      ok(u.estado === 403 && a.estado === 200, `${que}: usuario ${u.estado}, admin ${a.estado}`);
    }
    const borrar = await pedir(`/students/${alumno}`, { metodo: 'DELETE', token: tokenUsuario });
    ok(borrar.estado === 403, `borrar un alumno: usuario ${borrar.estado}`);

    const panelUsuario = await pedir('/dashboard/overview?month=10&year=2026', { token: tokenUsuario });
    const fu = panelUsuario.cuerpo?.finance;
    ok(fu?.incomeMonth === 100, 'la secretaria ve lo cobrado');
    ok(fu?.payrollPeriodTotal === undefined && fu?.netMonth === undefined && fu?.personalTotal === undefined,
      'pero no la nomina, ni el neto, ni los retiros');

    const profes = await pedir('/teachers', { token: tokenUsuario });
    ok(profes.estado === 200 && profes.cuerpo?.[0]?.firstName === 'Luis', 've la lista de profesores');
    ok(profes.cuerpo?.[0]?.weeklySalary === undefined, 'pero no lo que cobran');

    console.log('\n9. Actividad: quien registro que');
    r = await pedir('/activity?month=10&year=2026');
    ok(r.estado === 200, `el panel de actividad responde (${r.estado})`);
    ok(r.cuerpo?.totales?.registros > 0, `el admin registro ${r.cuerpo?.totales?.registros} cosas`);
    ok(r.cuerpo?.totales?.cobradoUSD === 100, `y cobro ${r.cuerpo?.totales?.cobradoUSD} en dolares`);

    const ajena = await pedir('/activity?userId=1', { token: tokenUsuario });
    ok(ajena.estado === 403, `la secretaria no ve la actividad del dueno (${ajena.estado})`);
    const propia = await pedir('/activity', { token: tokenUsuario });
    ok(propia.estado === 200 && propia.cuerpo?.totales?.registros === 0, 'la suya si, y esta vacia');

    console.log('\n10. Anular y restaurar');
    r = await pedir(`/payments/${mensualidad.id}/void`, { metodo: 'POST', body: { reason: 'prueba' } });
    ok(r.cuerpo?.status === 'anulado', `el cobro queda ${r.cuerpo?.status}`);
    r = await pedir('/dashboard/overview?month=10&year=2026');
    ok(r.cuerpo?.finance?.incomeMonth === 30, `y sale de la caja del mes: ${r.cuerpo?.finance?.incomeMonth}`);
    r = await pedir(`/payments/${mensualidad.id}/restore`, { metodo: 'POST' });
    ok(r.cuerpo?.status === 'pagado', `al restaurarlo vuelve a ${r.cuerpo?.status}`);

    console.log('\n11. Emision automatica de mensualidades');
    r = await pedir('/payments/generate-monthly', { metodo: 'POST', body: { month: 11, year: 2026 } });
    ok(r.estado === 201 && r.cuerpo?.created === 1, `emite noviembre (${r.cuerpo?.created})`);
    r = await pedir('/payments/generate-monthly', { metodo: 'POST', body: { month: 11, year: 2026 } });
    ok(r.cuerpo?.created === 0 && r.cuerpo?.skipped === 1, 'repetirlo no duplica nada');

  } catch (error) {
    console.error('\nERROR', error);
    fallos += 1;
  } finally {
    servidor.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLO(S)`}\n`);
    process.exit(fallos === 0 ? 0 : 1);
  }
})();
