/* eslint-disable no-console */
/**
 * Comprueba el rol de libreria: que pueda atender el mostrador y que no
 * alcance nada del resto de la academia.
 *
 *   npm run probar:libreria
 *
 * Usa una base de pruebas aparte, que borra al terminar.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/?directConnection=true';
process.env.DB_NAME = 'academia_libreria_prueba';
process.env.NODE_ENV = 'development';
process.env.SEED_ON_START = 'false';
process.env.AUTO_MONTHLY_CHARGES = 'false';
process.env.JWT_SECRET = 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b';
process.env.RATE_LIMIT_MAX = '5000';
process.env.ADMIN_EMAIL = 'admin@academia.com';
process.env.ADMIN_PASSWORD = 'Clave-Admin-Larga-2026';
process.env.LIBRERIA_NAME = 'Mostrador';
process.env.LIBRERIA_EMAIL = 'libreria@academia.com';
process.env.LIBRERIA_PASSWORD = 'Clave-Libreria-Larga-26';

const { connectWithRetry, mongoose } = require('../src/config/database');
const app = require('../src/app');
const { run } = require('../src/seed/bootstrap');

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  OK   ' : '  FALLA') + ' ' + t); if (!c) fallos += 1; };

const PUERTO = 4799;
const API = `http://127.0.0.1:${PUERTO}/api`;

(async () => {
  await connectWithRetry(5, 1000);
  await mongoose.connection.dropDatabase();
  await run({ silent: true });

  const servidor = app.listen(PUERTO);

  const pedir = async (ruta, { metodo = 'GET', body, token } = {}) => {
    const r = await fetch(API + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let datos = null;
    try { datos = await r.json(); } catch { datos = null; }
    return { estado: r.status, cuerpo: datos?.data };
  };

  const entrar = async (email, password) => {
    const r = await pedir('/auth/login', { metodo: 'POST', body: { email, password } });
    return r.cuerpo?.token;
  };

  try {
    console.log('\n1. La cuenta existe y tiene su rol');
    const admin = await entrar('admin@academia.com', 'Clave-Admin-Larga-2026');
    const r0 = await pedir('/auth/login', {
      metodo: 'POST',
      body: { email: 'libreria@academia.com', password: 'Clave-Libreria-Larga-26' },
    });
    ok(r0.estado === 200, `entra (${r0.estado})`);
    ok(r0.cuerpo?.user?.role === 'libreria', `con rol ${r0.cuerpo?.user?.role}`);
    const libreria = r0.cuerpo?.token;

    console.log('\n2. Puede atender el mostrador');
    let r = await pedir('/library/products', {
      metodo: 'POST', token: libreria,
      body: { name: 'Resma de hojas', cost: 2800, price: 4200, stock: 20 },
    });
    ok(r.estado === 201, `crea un producto (${r.estado})`);
    const producto = r.cuerpo?.id;

    r = await pedir('/library/sales', {
      metodo: 'POST', token: libreria,
      body: { items: [{ productId: producto, quantity: 3 }], paidAmount: 12600 },
    });
    ok(r.estado === 201, `registra una venta (${r.estado})`);
    ok(r.cuerpo?.total === 12600, `por ${r.cuerpo?.total} Bs`);
    const venta = r.cuerpo?.id;

    r = await pedir(`/library/products/${producto}`, { token: libreria });
    ok(r.cuerpo?.stock === 17, `el stock bajo de 20 a ${r.cuerpo?.stock}`);

    r = await pedir(`/library/products/${producto}/stock`, {
      metodo: 'POST', token: libreria, body: { quantity: 10, reason: 'reposicion' },
    });
    ok(r.estado === 200, `ajusta inventario (${r.estado})`);

    // Una venta a credito, para cobrarla despues.
    r = await pedir('/library/sales', {
      metodo: 'POST', token: libreria,
      body: { items: [{ productId: producto, quantity: 1 }], paidAmount: 0 },
    });
    const aCredito = r.cuerpo?.id;
    r = await pedir(`/library/sales/${aCredito}/settle`, {
      metodo: 'POST', token: libreria, body: { amount: 4200 },
    });
    ok(r.estado === 200, `cobra lo pendiente (${r.estado})`);

    for (const [ruta, que] of [
      ['/library/sales', 'las ventas'],
      ['/library/products/inventory', 'el inventario'],
      ['/library/sales/summary', 'las estadisticas'],
      ['/settings', 'la configuracion'],
      ['/activity', 'su propia actividad'],
    ]) {
      const res = await pedir(ruta, { token: libreria });
      ok(res.estado === 200, `ve ${que} (${res.estado})`);
    }

    console.log('\n3. Pero no alcanza el resto de la academia');
    for (const [ruta, que] of [
      ['/students', 'los alumnos'],
      ['/students/options', 'ni el selector de alumnos'],
      ['/students/debtors', 'ni quien debe'],
      ['/payments', 'los cobros de mensualidades'],
      ['/payments/summary', 'ni su resumen'],
      ['/works', 'los trabajos'],
      ['/teachers', 'los profesores'],
      ['/library/staff', 'el personal y sus datos'],
      ['/library/payroll', 'la nomina de libreria'],
      ['/teacher-payments', 'la nomina docente'],
      ['/rent', 'el alquiler'],
      ['/personal-payments', 'los retiros del dueno'],
      ['/auth/users', 'los usuarios'],
      ['/activity/all', 'la actividad de los demas'],
    ]) {
      const res = await pedir(ruta, { token: libreria });
      ok(res.estado === 403, `no ve ${que} (${res.estado})`);
    }

    console.log('\n4. Ni puede deshacer nada');
    for (const [ruta, metodo, que] of [
      [`/library/sales/${venta}/void`, 'POST', 'anular una venta'],
      [`/library/sales/${venta}`, 'DELETE', 'borrar una venta'],
      [`/library/products/${producto}`, 'DELETE', 'borrar un producto'],
    ]) {
      const res = await pedir(ruta, { metodo, token: libreria });
      ok(res.estado === 403, `no puede ${que} (${res.estado})`);
    }

    console.log('\n5. El panel se queda en lo suyo');
    const panel = await pedir('/dashboard/overview', { token: libreria });
    ok(panel.estado === 200, `abre el panel (${panel.estado})`);
    ok(Object.keys(panel.cuerpo?.finance || {}).length === 0, 'sin ninguna cifra de finanzas');
    ok(Object.keys(panel.cuerpo?.counts || {}).length === 0, 'sin el numero de alumnos');
    ok(panel.cuerpo?.debt?.payments === undefined, 'sin la deuda de los alumnos');
    ok(panel.cuerpo?.library?.salesCount >= 1, `pero con sus ventas (${panel.cuerpo?.library?.salesCount})`);
    ok(!!panel.cuerpo?.exchangeRate, 'y la tasa del dia, que cobra en bolivares');

    console.log('\n6. Y el administrador lo sigue viendo todo');
    const panelAdmin = await pedir('/dashboard/overview', { token: admin });
    ok(panelAdmin.cuerpo?.finance?.incomeMonth !== undefined, 'el panel entero');
    const alumnos = await pedir('/students', { token: admin });
    ok(alumnos.estado === 200, `y los alumnos (${alumnos.estado})`);

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
