/* eslint-disable no-console */
/**
 * Comprueba que la cuenta de visita y la academia no se ven entre si.
 *
 *   npm run probar:aislamiento
 *
 * Es la prueba que sostiene todo el diseno. Las dos comparten base: lo unico
 * que las separa es la marca `demo` de cada registro y el filtro que los
 * modelos ponen en cada consulta. Si eso falla, falla en silencio y de la
 * peor manera: un visitante leyendo nombres de alumnos reales, o registros
 * inventados sumando en los totales de la academia.
 *
 * Levanta un Mongo en memoria (replica set, que hacen falta transacciones
 * para dar de alta un alumno) y no toca ninguna base de verdad.
 */
// 'test' y no 'development' para que Mongoose no imprima cada consulta: aqui
// lo que hay que leer es el informe, no el trafico.
process.env.NODE_ENV = 'test';
process.env.SEED_ON_START = 'false';
process.env.AUTO_MONTHLY_CHARGES = 'false';
// Desechable: esta suite crea y borra registros a mansalva.
process.env.DB_NAME = 'academia_prueba_aislamiento';
process.env.JWT_SECRET = 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b';
process.env.RATE_LIMIT_MAX = '5000';
process.env.LOGIN_RATE_LIMIT_MAX = '500';
process.env.ADMIN_EMAIL = 'admin@academia.com';
process.env.ADMIN_PASSWORD = 'Clave-Admin-Larga-2026';
process.env.DEMO_NAME = 'Visita';
process.env.DEMO_EMAIL = 'demo@academia.com';
process.env.DEMO_PASSWORD = 'Clave-Visita-Larga-26';
// Tope bajo a proposito: la prueba tiene que llegar al limite sin tardar.
process.env.DEMO_MAX_REGISTROS = '3';
process.env.DEMO_HORAS_VIDA = '12';

const { MongoMemoryReplSet } = require('mongodb-memory-server');

let fallos = 0;
const ok = (c, t) => {
  console.log(`${c ? '  OK   ' : '  FALLA'} ${t}`);
  if (!c) fallos += 1;
};

const PUERTO = 4801;
const API = `http://127.0.0.1:${PUERTO}/api`;

(async () => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();

  // Despues de fijar la URI: env.js la lee al importarse.
  const { connectWithRetry, mongoose } = require('../src/config/database');
  const { enSesion } = require('../src/config/contexto');
  const { DESPLAZAMIENTO } = require('../src/models/plugins/autoIncrement');
  const app = require('../src/app');
  const { run } = require('../src/seed/bootstrap');

  await connectWithRetry(5, 1000);
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
    return { estado: r.status, cuerpo: datos?.data, mensaje: datos?.message };
  };

  const entrar = async (email, password) => {
    const r = await pedir('/auth/login', { metodo: 'POST', body: { email, password } });
    return r.cuerpo?.token;
  };

  const alumno = (nombre) => ({
    firstName: nombre,
    lastName: 'Prueba',
    monthlyFee: 70,
    status: 'activo',
  });

  // Cuenta documentos en la coleccion de verdad, sin filtro de ningun tipo.
  const enCrudo = (coleccion, filtro) =>
    mongoose.connection.collection(coleccion).countDocuments(filtro);

  try {
    console.log('\n1. Las dos cuentas entran');
    const admin = await entrar('admin@academia.com', 'Clave-Admin-Larga-2026');
    const rv = await pedir('/auth/login', {
      metodo: 'POST',
      body: { email: 'demo@academia.com', password: 'Clave-Visita-Larga-26' },
    });
    const visita = rv.cuerpo?.token;
    ok(Boolean(admin), 'el administrador');
    ok(rv.estado === 200, `la visita (${rv.estado})`);
    ok(rv.cuerpo?.user?.role === 'demo', `con rol ${rv.cuerpo?.user?.role}`);

    console.log('\n2. La academia tiene alumnos');
    const ana = await pedir('/students', { metodo: 'POST', token: admin, body: alumno('Ana') });
    await pedir('/students', { metodo: 'POST', token: admin, body: alumno('Luis') });
    const reales = await pedir('/students?limit=100', { token: admin });
    ok(reales.cuerpo?.length === 2, `el administrador ve ${reales.cuerpo?.length}`);

    console.log('\n3. La visita NO los ve: su mundo arranca vacio');
    const vacio = await pedir('/students?limit=100', { token: visita });
    ok(vacio.estado === 200, `puede entrar a alumnos (${vacio.estado})`);
    ok(vacio.cuerpo?.length === 0, `y ve ${vacio.cuerpo?.length} alumnos`);
    const panelVacio = await pedir('/dashboard/overview', { token: visita });
    ok(
      !panelVacio.cuerpo?.counts?.students,
      `su panel no cuenta alumnos (${panelVacio.cuerpo?.counts?.students ?? 0})`
    );

    console.log('\n4. Registra lo suyo y lo ve');
    const creado = await pedir('/students', {
      metodo: 'POST',
      token: visita,
      body: alumno('Visitante'),
    });
    ok(creado.estado === 201, `da de alta un alumno (${creado.estado})`);
    const suyos = await pedir('/students?limit=100', { token: visita });
    ok(suyos.cuerpo?.length === 1, `ahora ve ${suyos.cuerpo?.length}`);
    ok(suyos.cuerpo?.[0]?.firstName === 'Visitante', 'y es el que acaba de crear');

    console.log('\n5. Eso NO ensucia los libros de la academia');
    const despues = await pedir('/students?limit=100', { token: admin });
    ok(despues.cuerpo?.length === 2, `el administrador sigue viendo ${despues.cuerpo?.length}`);
    ok(
      !despues.cuerpo?.some((a) => a.firstName === 'Visitante'),
      'y el alumno del visitante no esta entre ellos'
    );

    console.log('\n6. Comparten coleccion, los separa la marca');
    const total = await enCrudo('students', {});
    const deLaVisita = await enCrudo('students', { demo: true });
    ok(total === 3, `en students hay ${total} documentos, los de los dos`);
    ok(deLaVisita === 1, `y solo ${deLaVisita} marcado como de la visita`);

    console.log('\n7. Cada mundo lleva su propia numeracion');
    ok(ana.cuerpo?.id === 1, `el alumno real es el id ${ana.cuerpo?.id}`);
    ok(
      creado.cuerpo?.id > DESPLAZAMIENTO,
      `el de la visita es el id ${creado.cuerpo?.id}, por encima del millon`
    );
    const tercero = await pedir('/students', {
      metodo: 'POST',
      token: admin,
      body: alumno('Tercera'),
    });
    ok(tercero.cuerpo?.id === 3, `y el siguiente real es el ${tercero.cuerpo?.id}, sin huecos`);

    console.log('\n8. Los recibos tampoco se pisan');
    const cobrosVisita = await pedir('/payments?limit=10', { token: visita });
    const cobrosReales = await pedir('/payments?limit=10', { token: admin });
    const recVisita = cobrosVisita.cuerpo?.[0]?.receiptNumber;
    const recReal = cobrosReales.cuerpo?.find((p) => p.receiptNumber)?.receiptNumber;
    ok(Boolean(recVisita && recReal), `visita ${recVisita} / academia ${recReal}`);
    ok(recVisita !== recReal, 'son correlativos distintos');

    console.log('\n9. La visita administra lo suyo: gastos personales');
    const gasto = await pedir('/personal-payments', {
      metodo: 'POST',
      token: visita,
      body: { concept: 'Retiro de prueba', amount: 120, currency: 'USD' },
    });
    ok(gasto.estado === 201, `puede registrarlos (${gasto.estado})`);
    const gastosVisita = await pedir('/personal-payments?limit=50', { token: visita });
    ok(gastosVisita.cuerpo?.length === 1, `y ve ${gastosVisita.cuerpo?.length}, el suyo`);
    const gastosAdmin = await pedir('/personal-payments?limit=50', { token: admin });
    ok(
      !gastosAdmin.cuerpo?.some((g) => g.concept === 'Retiro de prueba'),
      'el dueno no lo ve entre los suyos'
    );

    /*
     * El flujo de caja sale de un $unionWith sobre las dos nominas, uno de
     * los dos sitios donde el filtro va escrito a mano. Para que la prueba
     * signifique algo hace falta dinero cobrado, asi que la visita paga su
     * mensualidad: lo que se mira es que ese dinero NO aparezca en la serie
     * del dueno.
     */
    console.log('\n10. El dinero de la visita no entra en la caja de la academia');
    const suCobro = (await pedir('/payments?limit=10', { token: visita })).cuerpo?.[0];
    const pagado = await pedir(`/students/${creado.cuerpo?.id}/payment-status`, {
      metodo: 'POST',
      token: visita,
      body: { paid: [suCobro?.id] },
    });
    ok(pagado.estado === 200, `la visita cobra su mensualidad (${pagado.estado})`);

    const suma = (r) => (r.cuerpo?.series || []).reduce((t, m) => t + (m.ingresos || 0), 0);
    const cajaVisita = await pedir('/dashboard/cashflow', { token: visita });
    const cajaAdmin = await pedir('/dashboard/cashflow', { token: admin });
    ok(suma(cajaVisita) > 0, `en su caja entran ${suma(cajaVisita)}`);
    ok(suma(cajaAdmin) === 0, `y en la de la academia, ${suma(cajaAdmin)}`);

    console.log('\n11. Y borra lo suyo, pero no alcanza lo de la academia');
    const borrarSuyo = await pedir(`/students/${creado.cuerpo?.id}`, {
      metodo: 'DELETE',
      token: visita,
    });
    ok(borrarSuyo.estado === 200, `borra su alumno (${borrarSuyo.estado})`);

    const borrarReal = await pedir(`/students/${ana.cuerpo?.id}`, {
      metodo: 'DELETE',
      token: visita,
    });
    ok(borrarReal.estado === 404, `y el de la academia le sale inexistente (${borrarReal.estado})`);
    const siguenReales = await enCrudo('students', { demo: { $ne: true } });
    ok(siguenReales === 3, `los ${siguenReales} alumnos reales siguen ahi`);

    console.log('\n12. Ni leyendolo de uno en uno por su id');
    const espiar = await pedir(`/students/${ana.cuerpo?.id}`, { token: visita });
    ok(espiar.estado === 404, `pedir el alumno 1 le devuelve ${espiar.estado}`);
    ok(!espiar.cuerpo?.firstName, 'y ni el nombre se asoma');

    console.log('\n13. El $lookup de deudores tampoco filtra nombres');
    // Deudores cruza payments con students: el sitio donde un fallo ensenaria
    // nombres reales directamente, sin rodeos.
    const deudores = await pedir('/students/debtors?limit=50', { token: visita });
    ok(
      !(deudores.cuerpo || []).some((d) => /Ana|Luis|Tercera/.test(d.name || '')),
      `${(deudores.cuerpo || []).length} deudores, ninguno de la academia`
    );

    console.log('\n14. Vaciar el cajon no toca a la academia');
    const { vaciar } = require('./sembrar-demo');
    await enSesion(true, () => vaciar());
    const realesTrasVaciar = await enCrudo('students', { demo: { $ne: true } });
    const visitaTrasVaciar = await enCrudo('students', { demo: true });
    ok(realesTrasVaciar === 3, `quedan los ${realesTrasVaciar} alumnos reales`);
    ok(visitaTrasVaciar === 0, `y ${visitaTrasVaciar} de la visita`);
    const cuarto = await pedir('/students', {
      metodo: 'POST',
      token: admin,
      body: alumno('Cuarta'),
    });
    ok(cuarto.cuerpo?.id === 4, `el siguiente alumno real es el ${cuarto.cuerpo?.id}`);

    /*
     * El tope. La cuenta es publica y puede insertar: sin un limite, un
     * visitante aburrido o un script llenan la base, y la base es la misma
     * que la de la academia.
     */
    console.log('\n15. La visita tiene un tope de lo que puede crear');
    const topeado = [];
    for (let i = 1; i <= 5; i += 1) {
      const r = await pedir('/students', {
        metodo: 'POST',
        token: visita,
        body: alumno(`Tope${i}`),
      });
      topeado.push(r.estado);
    }
    ok(
      topeado.filter((e) => e === 201).length === 3,
      `crea ${topeado.filter((e) => e === 201).length} y no mas (tope 3)`
    );
    ok(topeado[3] === 400 && topeado[4] === 400, `los siguientes rebotan con ${topeado[3]}`);

    const ultimo = await pedir('/students', {
      metodo: 'POST',
      token: visita,
      body: alumno('Uno mas'),
    });
    ok(/limite/i.test(ultimo.mensaje || ''), `y lo dice claro: "${ultimo.mensaje}"`);

    const aAdmin = await pedir('/students', {
      metodo: 'POST',
      token: admin,
      body: alumno('Quinta'),
    });
    ok(aAdmin.estado === 201, `a ti el tope no te afecta (${aAdmin.estado})`);

    /*
     * Y el barrido por antiguedad. Se les envejece el createdAt por debajo,
     * sin pasar por los modelos, que es la unica forma de simular que paso
     * medio dia.
     */
    console.log('\n16. Lo de la visita caduca a las 12 horas');
    // Contados antes, no a mano: el numero cambia cada vez que se anade una
    // comprobacion mas arriba, y un numero fijo aqui solo da falsos fallos.
    const realesAntes = await enCrudo('students', { demo: { $ne: true } });
    const haceTrece = new Date(Date.now() - 13 * 60 * 60 * 1000);
    await mongoose.connection
      .collection('students')
      .updateMany({ demo: true }, { $set: { createdAt: haceTrece } });
    await mongoose.connection
      .collection('students')
      .updateMany({ demo: { $ne: true } }, { $set: { createdAt: haceTrece } });

    const { limpiarDemo } = require('../src/services/limpiezaDemo');
    const barrido = await limpiarDemo();
    ok(barrido.total > 0, `barre ${barrido.total} registro(s) de la visita`);

    const quedanVisita = await enCrudo('students', { demo: true });
    const quedanReales = await enCrudo('students', { demo: { $ne: true } });
    ok(quedanVisita === 0, `no le queda ninguno (${quedanVisita})`);
    ok(
      quedanReales === realesAntes,
      `y tus ${quedanReales} alumnos siguen ahi, igual de viejos y sin tocar`
    );
  } finally {
    servidor.close();
    await mongoose.disconnect();
    await replica.stop();
  }

  console.log(`\n${fallos === 0 ? '  TODO EN ORDEN' : `  ${fallos} FALLO(S)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(`\n  Error: ${error.message}\n`);
  process.exit(1);
});
