/* eslint-disable no-console */
/**
 * Crea las dos cuentas contra un MongoDB de verdad y comprueba que funcionan.
 *
 * Usa un Mongo en memoria, asi que no hace falta Docker ni toca ninguna base
 * real. Es una prueba, no una herramienta de administracion: para crear las
 * cuentas en tu base se usa `npm run bootstrap` con el entorno levantado.
 *
 *   node scripts/probar-cuentas.js
 */
const { spawn } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  OK   ' : '  FALLA') + ' ' + t); if (!c) fallos += 1; };

(async () => {
  console.log('\nLevantando un MongoDB en memoria...');
  const mongo = await MongoMemoryServer.create();

  // El entorno de la prueba: las dos cuentas con claves que pasan la revision.
  process.env.MONGODB_URI = mongo.getUri();
  process.env.DB_NAME = 'academia_prueba';
  process.env.SEED_ON_START = 'false';
  process.env.ADMIN_NAME = 'Francisco';
  process.env.ADMIN_EMAIL = 'admin@academia.com';
  process.env.ADMIN_PASSWORD = 'Clave-Admin-Larga-2026';
  process.env.USUARIO_NAME = 'Secretaria';
  process.env.USUARIO_EMAIL = 'usuario@academia.com';
  process.env.USUARIO_PASSWORD = 'Clave-Usuario-Larga-2026';
  process.env.JWT_SECRET = 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b';

  const { connectWithRetry, mongoose } = require('../src/config/database');
  const { User } = require('../src/models');
  const { run } = require('../src/seed/bootstrap');
  const { esAdmin, recortarPanel } = require('../src/config/roles');

  await connectWithRetry(3, 500);

  try {
    console.log('\n1. Crear las cuentas');
    await run({ silent: false });

    const admin = await User.findOne({ email: 'admin@academia.com' }).select('+password');
    const usuario = await User.findOne({ email: 'usuario@academia.com' }).select('+password');

    ok(!!admin && !!usuario, 'se crearon las dos cuentas');
    ok(admin.role === 'admin', `la del dueno tiene rol ${admin?.role}`);
    ok(usuario.role === 'usuario', `la del dia a dia tiene rol ${usuario?.role}`);
    ok(admin.id === 1 && usuario.id === 2, `ids correlativos: ${admin?.id} y ${usuario?.id}`);
    ok(usuario.name === 'Secretaria', `nombre: ${usuario?.name}`);

    console.log('\n2. Las contrasenas');
    ok(usuario.password !== process.env.USUARIO_PASSWORD, 'no se guarda en claro');
    ok(usuario.password.startsWith('$2'), `se guarda cifrada con bcrypt (${usuario.password.slice(0, 7)}...)`);
    ok(await usuario.checkPassword('Clave-Usuario-Larga-2026'), 'la clave correcta entra');
    ok(!(await usuario.checkPassword('otra-cosa')), 'una equivocada no');
    ok(!(await usuario.checkPassword('Clave-Admin-Larga-2026')), 'ni la del administrador');
    ok(!!usuario.passwordChangedAt, 'queda sellado cuando se puso la clave');

    console.log('\n3. La contrasena no sale de la base por descuido');
    const sinPedirla = await User.findOne({ email: 'usuario@academia.com' });
    ok(sinPedirla.password === undefined, 'una consulta normal no la trae');
    ok(!('password' in sinPedirla.toJSON()), 'ni aparece al serializar a JSON');

    console.log('\n4. Arrancar dos veces no rompe nada');
    const antes = usuario.password;
    await run({ silent: true });
    const total = await User.countDocuments();
    const otraVez = await User.findOne({ email: 'usuario@academia.com' }).select('+password');
    ok(total === 2, `siguen siendo 2 cuentas, no 4 (${total})`);
    ok(otraVez.password === antes, 'y NO se le repuso la contrasena');

    console.log('\n5. Una clave cambiada desde la aplicacion se respeta');
    otraVez.password = 'La-Cambio-La-Secretaria-99';
    await otraVez.save();
    await run({ silent: true });
    const tras = await User.findOne({ email: 'usuario@academia.com' }).select('+password');
    ok(await tras.checkPassword('La-Cambio-La-Secretaria-99'),
      'el arranque no la devuelve al valor del fichero de entorno');

    console.log('\n6. Roles antiguos');
    await User.create({ name: 'Vieja', email: 'vieja@academia.com', password: 'clave-larga-vieja-1', role: 'secretaria' });
    const vieja = await User.findOne({ email: 'vieja@academia.com' });
    ok(vieja.role === 'usuario', `una cuenta de secretaria queda como ${vieja.role}`);
    ok(!esAdmin(vieja) && esAdmin(admin), 'y no se la toma por administradora');

    console.log('\n7. Lo que cada una ve del panel');
    const panel = {
      period: {}, counts: { students: 30 }, works: {}, debt: {}, library: {}, exchangeRate: {},
      finance: { incomeMonth: 1795, debtPeriod: 2100, personalTotal: 578, netMonth: 1126, payrollPeriodTotal: 120 },
    };
    const comoAdmin = recortarPanel(panel, admin);
    const comoUsuario = recortarPanel(panel, tras);
    ok(comoAdmin.finance.personalTotal === 578, 'el dueno ve sus retiros');
    ok(comoUsuario.finance.personalTotal === undefined
      && comoUsuario.finance.netMonth === undefined
      && comoUsuario.finance.payrollPeriodTotal === undefined,
      'la secretaria no ve retiros, ni el neto, ni la nomina');
    ok(comoUsuario.finance.incomeMonth === 1795 && comoUsuario.finance.debtPeriod === 2100,
      'pero si lo que necesita para cobrar');

    console.log('\n8. Sin USUARIO_PASSWORD no se crea la cuenta');
    await User.deleteMany({});

    /*
     * Esto va en un proceso aparte a proposito.
     *
     * config/env lee process.env UNA VEZ, al cargarse. Borrar la variable aqui
     * y volver a pedir el modulo no cambia nada: el objeto ya esta construido
     * y en cache. Si se probara asi, la prueba diria que la cuenta se crea
     * igual, y estaria midiendo la cache de require en vez del comportamiento.
     * Un proceso limpio es la unica forma de medir el arranque de verdad.
     */
    const hijo = await new Promise((resolve) => {
      const entorno = { ...process.env };
      delete entorno.USUARIO_PASSWORD;
      delete entorno.USUARIO_EMAIL;

      const p = spawn(process.execPath, ['-e', `
        const { connectWithRetry, mongoose } = require('${__dirname.replace(/\\/g, '/')}/../src/config/database');
        const { User } = require('${__dirname.replace(/\\/g, '/')}/../src/models');
        const { run } = require('${__dirname.replace(/\\/g, '/')}/../src/seed/bootstrap');
        (async () => {
          await connectWithRetry(3, 500);
          await run({ silent: true });
          const total = await User.countDocuments();
          const hayUsuario = Boolean(await User.findOne({ role: 'usuario' }));
          console.log(JSON.stringify({ total, hayUsuario }));
          await mongoose.disconnect();
          process.exit(0);
        })().catch((e) => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
      `], { env: entorno });

      let salida = '';
      p.stdout.on('data', (d) => { salida += d; });
      p.stderr.on('data', () => {});
      p.on('close', () => {
        const linea = salida.trim().split('\n').filter((l) => l.startsWith('{')).pop();
        resolve(linea ? JSON.parse(linea) : { error: 'sin respuesta' });
      });
    });

    ok(hijo.total === 1, `en un arranque limpio solo se crea el administrador (${hijo.total} cuenta)`);
    ok(hijo.hayUsuario === false,
      'una cuenta sin clave definida NO nace con una clave conocida');

  } catch (error) {
    console.error('\nERROR', error);
    fallos += 1;
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
    console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLO(S)`}\n`);
    process.exit(fallos === 0 ? 0 : 1);
  }
})();
