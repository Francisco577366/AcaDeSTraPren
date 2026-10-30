/* eslint-disable no-console */
/**
 * Comprueba QUE PUEDE Y QUE NO la cuenta publica de demostracion.
 *
 *   npm run probar:demo
 *
 * El aislamiento —que no vea ni un dato de la academia— lo prueba
 * probar-aislamiento.js, que es la otra mitad y la mas importante. Aqui solo
 * se miran los permisos: que pueda ensenar la aplicacion entera sobre sus
 * propios datos, y que no alcance lo que es de la casa y no del cajon.
 */
process.env.NODE_ENV = 'test';
// Base desechable, y el nombre importa: mas abajo hay un dropDatabase(). Con
// DB_NAME=academia esta suite borraria la academia de verdad.
process.env.DB_NAME = 'academia_prueba_visita';
process.env.SEED_ON_START = 'false';
process.env.AUTO_MONTHLY_CHARGES = 'false';
process.env.JWT_SECRET = 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b';
process.env.RATE_LIMIT_MAX = '5000';
process.env.LOGIN_RATE_LIMIT_MAX = '500';
process.env.ADMIN_EMAIL = 'admin@academia.com';
process.env.ADMIN_PASSWORD = 'Clave-Admin-Larga-2026';
process.env.DEMO_NAME = 'Visita';
process.env.DEMO_EMAIL = 'demo@academia.com';
process.env.DEMO_PASSWORD = 'Clave-Visita-Larga-26';

const { connectWithRetry, mongoose } = require('../src/config/database');
const app = require('../src/app');
const { run } = require('../src/seed/bootstrap');

let fallos = 0;
const ok = (c, t) => {
  console.log(`${c ? '  OK   ' : '  FALLA'} ${t}`);
  if (!c) fallos += 1;
};

const PUERTO = 4788;
const API = `http://127.0.0.1:${PUERTO}/api`;

(async () => {
  await connectWithRetry(5, 1000);
  await mongoose.connection.dropDatabase();
  await run({ silent: true });

  const servidor = app.listen(PUERTO);

  const pedir = async (ruta, { metodo = 'GET', body, token } = {}) => {
    const r = await fetch(API + ruta, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let datos = null;
    try {
      datos = await r.json();
    } catch {
      datos = null;
    }
    return { estado: r.status, cuerpo: datos?.data };
  };

  try {
    console.log('\n1. La cuenta entra y tiene su rol');
    const r0 = await pedir('/auth/login', {
      metodo: 'POST',
      body: { email: 'demo@academia.com', password: 'Clave-Visita-Larga-26' },
    });
    ok(r0.estado === 200, `entra (${r0.estado})`);
    ok(r0.cuerpo?.user?.role === 'demo', `con rol ${r0.cuerpo?.user?.role}`);
    const visita = r0.cuerpo?.token;

    console.log('\n2. Puede ensenar la aplicacion sobre sus propios datos');
    const panel = await pedir('/dashboard/overview', { token: visita });
    ok(panel.estado === 200, `ve el panel (${panel.estado})`);

    const alta = await pedir('/students', {
      metodo: 'POST',
      token: visita,
      body: { firstName: 'Alumno', lastName: 'De prueba', monthlyFee: 70, status: 'activo' },
    });
    ok(alta.estado === 201, `inscribe un alumno (${alta.estado})`);
    const alumnoId = alta.cuerpo?.id;

    const edicion = await pedir(`/students/${alumnoId}`, {
      metodo: 'PUT',
      token: visita,
      body: { firstName: 'Alumno', lastName: 'Editado', monthlyFee: 80 },
    });
    ok(edicion.estado === 200, `y lo edita (${edicion.estado})`);

    const producto = await pedir('/library/products', {
      metodo: 'POST',
      token: visita,
      body: { name: 'Cuaderno', cost: 1000, price: 1800, stock: 10 },
    });
    ok(producto.estado === 201, `crea un producto de libreria (${producto.estado})`);

    const venta = await pedir('/library/sales', {
      metodo: 'POST',
      token: visita,
      body: {
        items: [{ productId: producto.cuerpo?.id, quantity: 2 }],
        paidAmount: 3600,
      },
    });
    ok(venta.estado === 201, `y registra una venta (${venta.estado})`);

    const gasto = await pedir('/personal-payments', {
      metodo: 'POST',
      token: visita,
      body: { concept: 'Gasto de prueba', amount: 50, currency: 'USD' },
    });
    ok(gasto.estado === 201, `anota un gasto personal (${gasto.estado})`);

    // El personal de la libreria si lo administra: es suyo, inventado por
    // ella. Lo que no alcanza es la NOMINA, que es de la casa.
    const personal = await pedir('/library/staff', { token: visita });
    ok(personal.estado === 200, `administra su propio personal (${personal.estado})`);

    console.log('\n3. Y deshacer lo suyo, que para eso es un cajon de pruebas');
    const borrado = await pedir(`/students/${alumnoId}`, { metodo: 'DELETE', token: visita });
    ok(borrado.estado === 200, `borra el alumno que creo (${borrado.estado})`);
    const borraGasto = await pedir(`/personal-payments/${gasto.cuerpo?.id}`, {
      metodo: 'DELETE',
      token: visita,
    });
    ok(borraGasto.estado === 200, `y el gasto (${borraGasto.estado})`);

    console.log('\n4. Lo que NO alcanza');
    const vetadas = [
      ['/auth/users', 'las cuentas de la aplicacion'],
      ['/activity/all', 'la actividad de los demas'],
      ['/rent', 'el alquiler'],
      ['/teacher-payments', 'la nomina docente'],
      ['/library/payroll', 'la nomina de libreria'],
    ];
    for (const [ruta, que] of vetadas) {
      const r = await pedir(ruta, { token: visita });
      // 403 exacto, no "403 o 404": un 404 valdria igual si la ruta no
      // existiera, y entonces la comprobacion no estaria comprobando nada.
      ok(r.estado === 403, `${que} (${r.estado})`);
    }

    const clave = await pedir('/auth/change-password', {
      metodo: 'POST',
      token: visita,
      body: { currentPassword: 'Clave-Visita-Larga-26', newPassword: 'OtraClaveLarga2026' },
    });
    ok(clave.estado === 403, `no puede cambiar su contrasena (${clave.estado})`);
    console.log('         es compartida: el primero que la cambiara dejaria fuera al resto');

    console.log('\n5. Y el administrador lo sigue teniendo todo');
    const admin = (
      await pedir('/auth/login', {
        metodo: 'POST',
        body: { email: 'admin@academia.com', password: 'Clave-Admin-Larga-2026' },
      })
    ).cuerpo?.token;
    const alquiler = await pedir('/rent', { token: admin });
    ok(alquiler.estado === 200, `el alquiler (${alquiler.estado})`);
    const cuentas = await pedir('/auth/users', { token: admin });
    ok(cuentas.estado === 200, `y las cuentas (${cuentas.estado})`);
  } finally {
    servidor.close();
    await mongoose.disconnect();
  }

  console.log(`\n${fallos === 0 ? '  TODO CORRECTO' : `  ${fallos} FALLO(S)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(`\n  Error: ${error.message}\n`);
  process.exit(1);
});
