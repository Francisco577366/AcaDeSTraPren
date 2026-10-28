/* eslint-disable no-console */
const env = require('../config/env');
const { connectWithRetry, mongoose } = require('../config/database');
const { asegurarBaseLocal } = require('../config/guardia');
const { User } = require('../models');
const { exportData, importData, hasDataset, isEmpty, DATA_FILE } = require('./dataset');

/**
 * Las cuentas con las que se entra.
 *
 *   admin    El dueno. Ve y hace todo.
 *   usuario  El dia a dia: alumnos, cobros y libreria. No ve sueldos, ni el
 *            alquiler, ni los retiros personales, ni la ganancia.
 *   demo     Una visita. Lo mismo que usuario, pero su cuenta es publica y
 *            solo existe en el despliegue de demostracion, contra su base.
 *   libreria Quien atiende el mostrador: vende y ajusta inventario, y nada
 *            mas de la academia.
 *
 * La del usuario solo se crea si hay contrasena definida: una cuenta con
 * clave conocida es peor que no tener la cuenta.
 */
function cuentasDefinidas() {
  const cuentas = [
    { ...env.admin, role: 'admin' },
  ];
  if (env.usuario.email && env.usuario.password) {
    cuentas.push({ ...env.usuario, role: 'usuario' });
  }
  if (env.demo.email && env.demo.password) {
    cuentas.push({ ...env.demo, role: 'demo' });
  }
  if (env.libreria.email && env.libreria.password) {
    cuentas.push({ ...env.libreria, role: 'libreria' });
  }
  return cuentas;
}

/**
 * Garantiza una cuenta sin pisar la que ya exista.
 *
 * Si el usuario ya esta, NO se le cambia la contrasena: alguien pudo haberla
 * cambiado desde la aplicacion, y reponerla en cada arranque la devolveria al
 * valor del fichero de entorno, que es justo lo que no se quiere.
 */
async function garantizarCuenta({ name, email, password, role }, log) {
  const existente = await User.findOne({ email: String(email).toLowerCase() });

  if (existente) {
    // El rol si se corrige, por si cambio en el entorno o venia de los roles
    // antiguos (coordinador, secretaria).
    if (existente.role !== role) {
      existente.role = role;
      await existente.save();
      log(`Cuenta ${email}: rol ajustado a ${role}`);
    } else {
      log(`Cuenta ${email} lista (${role})`);
    }
    return { creada: false, user: existente };
  }

  const user = await User.create({ name, email, password, role });
  log(`Cuenta ${email} creada (${role})`);
  return { creada: true, user };
}

/**
 * Arranque de la base:
 *
 * 1. Garantiza las cuentas definidas en el entorno, para poder entrar.
 * 2. Si la base esta vacia y existe un seed guardado (src/seed/data.json),
 *    lo carga. Asi, aunque se borre el volumen de Docker, los datos vuelven.
 *
 * Nunca pisa datos existentes: si ya hay registros, no toca nada.
 */
async function run({ silent = true } = {}) {
  const log = silent ? () => {} : (...args) => console.log('[bootstrap]', ...args);

  const resultados = [];
  for (const cuenta of cuentasDefinidas()) {
    resultados.push(await garantizarCuenta(cuenta, log));
  }

  if (!env.usuario.email || !env.usuario.password) {
    log('Sin USUARIO_EMAIL/USUARIO_PASSWORD: no se crea la cuenta del dia a dia');
  }
  if (!env.demo.email || !env.demo.password) {
    log('Sin DEMO_EMAIL/DEMO_PASSWORD: no se crea la cuenta de demostracion');
  }

  if (!env.seedOnStart) {
    log('Carga del seed desactivada (SEED_ON_START=false)');
    return { cuentas: resultados, seedLoaded: false };
  }
  if (!hasDataset()) {
    log('No hay seed guardado; la base arranca como este');
    return { cuentas: resultados, seedLoaded: false };
  }
  if (!(await isEmpty())) {
    log('La base ya tiene datos; el seed no se aplica');
    return { cuentas: resultados, seedLoaded: false };
  }

  const { counts } = await importData();
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  log(`Seed cargado: ${total} registros (${JSON.stringify(counts)})`);

  return { cuentas: resultados, seedLoaded: true };
}

/**
 * CLI:
 *   npm run seed          -> guarda el estado actual en data.json
 *   npm run seed:load     -> vuelve a cargar data.json (sin borrar)
 *   npm run seed:restore  -> borra los datos y restaura data.json
 *   npm run bootstrap     -> solo garantiza las cuentas
 */
if (require.main === module) {
  const command = process.argv[2] || 'bootstrap';

  // Lo que borra o sobrescribe solo corre contra una base local. Exportar no:
  // leer la base de produccion para guardar un respaldo es justo lo que hay
  // que poder hacer.
  if (command === 'load' || command === 'restore') {
    asegurarBaseLocal(command === 'restore' ? 'seed:restore' : 'seed:load');
  }

  (async () => {
    try {
      await connectWithRetry();

      if (command === 'export') {
        const { counts } = await exportData();
        console.log(`[seed] Guardado en ${DATA_FILE}`);
        console.log(`[seed] ${JSON.stringify(counts, null, 2)}`);
      } else if (command === 'load' || command === 'restore') {
        const { counts } = await importData({ replace: command === 'restore' });
        console.log(`[seed] Cargado desde ${DATA_FILE}`);
        console.log(`[seed] ${JSON.stringify(counts, null, 2)}`);
      } else {
        await run({ silent: false });
      }

      await mongoose.disconnect();
      process.exit(0);
    } catch (error) {
      console.error('[seed] Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { run, garantizarCuenta, cuentasDefinidas };
