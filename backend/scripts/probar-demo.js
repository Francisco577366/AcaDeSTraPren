/* eslint-disable no-console */
/**
 * Comprueba el despliegue de DEMOSTRACION: que la cuenta publica pueda
 * mirar y probar, que no pueda romper nada, y sobre todo que no haya ni un
 * dato de la academia real al alcance.
 *
 *   npm run probar:demo
 */
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/?directConnection=true';
process.env.DB_NAME = process.env.DB_NAME || 'academia_demo';
process.env.NODE_ENV = 'development';
process.env.SEED_ON_START = 'false';
process.env.AUTO_MONTHLY_CHARGES = 'false';
process.env.JWT_SECRET = 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b';
process.env.RATE_LIMIT_MAX = '5000';
process.env.DEMO_EMAIL = 'demo@demo.academia';
process.env.DEMO_PASSWORD = 'VerLaDemo2026';

const { connectWithRetry, mongoose } = require('../src/config/database');
const app = require('../src/app');

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  OK   ' : '  FALLA') + ' ' + t); if (!c) fallos += 1; };

const PUERTO = 4788;
const API = `http://127.0.0.1:${PUERTO}/api`;

/** Nombres reales de la academia que NO pueden aparecer en la demo. */
const NOMBRES_REALES = [
  'Andreina', 'Lugo', 'joshua', 'Estefani', 'arlenis', 'Jadiel',
  'Sarahi', 'Gonzalo', 'Amanda', 'Neurth', 'Escalona', 'Stefany',
];

(async () => {
  await connectWithRetry(5, 1000);
  const servidor = app.listen(PUERTO);

  const pedir = async (ruta, { metodo = 'GET', body, token } = {}) => {
    const r = await fetch(API + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let datos = null;
    try { datos = await r.json(); } catch { datos = null; }
    return { estado: r.status, datos, cuerpo: datos?.data };
  };

  try {
    console.log('\n1. La visita entra');
    let r = await pedir('/auth/login', {
      metodo: 'POST',
      body: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
    });
    ok(r.estado === 200, `entra con la cuenta publica (${r.estado})`);
    ok(r.cuerpo?.user?.role === 'demo', `con rol ${r.cuerpo?.user?.role}`);
    const token = r.cuerpo?.token;

    console.log('\n2. Puede mirar y probar');
    const mirar = [
      ['/students', 'los alumnos'],
      ['/payments', 'los cobros'],
      ['/library/products', 'el catalogo'],
      ['/library/sales', 'las ventas'],
      ['/dashboard/overview', 'el panel'],
      ['/activity', 'su actividad'],
    ];
    for (const [ruta, que] of mirar) {
      const res = await pedir(ruta, { token });
      ok(res.estado === 200, `ve ${que} (${res.estado})`);
    }

    r = await pedir('/students', {
      metodo: 'POST', token,
      body: { firstName: 'Visitante', lastName: 'De Prueba', monthlyFee: 70, monthlyCharge: 'pendiente' },
    });
    ok(r.estado === 201, `puede inscribir un alumno (${r.estado})`);
    const nuevo = r.cuerpo?.id;

    // El PUT pide el formulario completo, como lo manda la aplicacion.
    r = await pedir(`/students/${nuevo}`, {
      metodo: 'PUT', token,
      body: { firstName: 'Visitante', lastName: 'De Prueba', monthlyFee: 70, grade: '3er grado' },
    });
    ok(r.estado === 200, `y editarlo (${r.estado})`);

    console.log('\n3. Pero no puede romper nada');
    const prohibido = [
      [`/students/${nuevo}`, 'DELETE', 'borrar un alumno'],
      ['/payments/1', 'DELETE', 'borrar un cobro'],
      ['/payments/1/void', 'POST', 'anular un cobro'],
      ['/library/sales/1', 'DELETE', 'borrar una venta'],
      ['/auth/users', 'GET', 'ver los usuarios'],
      ['/personal-payments', 'GET', 'ver los retiros'],
      ['/rent', 'GET', 'ver el alquiler'],
      ['/teacher-payments', 'GET', 'ver la nomina'],
      ['/activity/all', 'GET', 'ver la actividad de todos'],
    ];
    for (const [ruta, metodo, que] of prohibido) {
      const res = await pedir(ruta, { metodo, token });
      ok(res.estado === 403, `no puede ${que} (${res.estado})`);
    }

    r = await pedir('/auth/change-password', {
      metodo: 'POST', token,
      body: { currentPassword: process.env.DEMO_PASSWORD, newPassword: 'OtraClaveLarga2026' },
    });
    ok(r.estado === 403,
      `no puede cambiar la clave, o dejaria fuera al resto de visitas (${r.estado})`);

    console.log('\n4. Y no ve las cifras del negocio');
    const panel = await pedir('/dashboard/overview', { token });
    const f = panel.cuerpo?.finance;
    ok(f?.personalTotal === undefined && f?.netMonth === undefined && f?.payrollPeriodTotal === undefined,
      'ni retiros, ni neto, ni nomina');
    const profes = await pedir('/teachers', { token });
    ok(profes.cuerpo?.[0]?.weeklySalary === undefined, 'ni lo que cobra cada profesor');

    console.log('\n5. Lo importante: ni un dato real');
    const sitios = ['/students?limit=200', '/payments?limit=200', '/teachers', '/library/sales?limit=200'];
    let encontrado = null;
    for (const ruta of sitios) {
      const res = await pedir(ruta, { token });
      const texto = JSON.stringify(res.cuerpo || '');
      const hit = NOMBRES_REALES.find((n) => texto.includes(n));
      if (hit) { encontrado = `${hit} (en ${ruta})`; break; }
    }
    ok(!encontrado, encontrado
      ? `APARECE UN NOMBRE REAL: ${encontrado}`
      : 'ningun nombre de la academia real asoma por la demo');

    const alumnos = await pedir('/students?limit=200', { token });
    ok((alumnos.cuerpo || []).length > 5, `la demo tiene sus propios alumnos (${(alumnos.cuerpo || []).length})`);

    console.log('\n6. Las bases estan de verdad separadas');
    const real = mongoose.connection.client.db('academia');
    const demo = mongoose.connection.client.db(process.env.DB_NAME);
    const nombresReales = (await real.collection('students').find({}).limit(3).toArray()).map((s) => s.firstName);
    const nombresDemo = (await demo.collection('students').find({}).limit(3).toArray()).map((s) => s.firstName);
    ok(!nombresDemo.some((n) => nombresReales.includes(n)),
      `real: ${nombresReales.join(', ')} | demo: ${nombresDemo.join(', ')}`);

    const usuariosReales = await real.collection('users').find({ role: 'demo' }).toArray();
    ok(usuariosReales.length === 0,
      `la cuenta de demostracion NO existe en la base real (${usuariosReales.length} encontrada/s)`);

  } catch (error) {
    console.error('\nERROR', error);
    fallos += 1;
  } finally {
    servidor.close();
    await mongoose.disconnect();
    console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLO(S)`}\n`);
    process.exit(fallos === 0 ? 0 : 1);
  }
})();
