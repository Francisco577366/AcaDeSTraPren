/* eslint-disable no-console */
/**
 * Deja lista la base de Atlas: indices y cuentas.
 *
 *   npm run atlas:preparar           indices y cuentas
 *   npm run atlas:preparar -- datos  y ademas sube el seed de la academia
 *   npm run atlas:demo               borra lo que haya creado la visita
 *   npm run atlas:demo -- datos      y le deja registros inventados
 *
 * Lee la configuracion de .env.vercel, que es la misma que pusiste en Vercel,
 * para que la cadena de conexion no haya que escribirla otra vez y no pueda
 * teclearse mal.
 *
 * Hace falta porque en serverless no hay arranque: src/server.js, que es quien
 * crea las cuentas y los indices en un servidor normal, alli nunca corre.
 *
 * Nada de lo que hace borra, salvo `atlas:demo`, que rehace el cajon de
 * pruebas. Y ese solo puede tocar registros marcados como de la visita: el
 * filtro lo ponen los modelos, no el script.
 */
const fs = require('fs');
const path = require('path');

const FICHERO = path.join(__dirname, '..', '..', '.env.vercel');

if (!fs.existsSync(FICHERO)) {
  console.error(`\n  No encuentro ${FICHERO}\n`);
  process.exit(1);
}

// Se cargan ANTES de pedir la configuracion: env.js lee process.env al
// importarse, asi que despues ya seria tarde.
fs.readFileSync(FICHERO, 'utf8').split(/\r?\n/).forEach((linea) => {
  if (!linea.includes('=') || linea.trim().startsWith('#')) return;
  const clave = linea.slice(0, linea.indexOf('=')).trim();
  const valor = linea.slice(linea.indexOf('=') + 1).trim();
  if (valor) process.env[clave] = valor;
});

const uri = process.env.MONGODB_URI || '';
if (!uri || uri.includes('PEGA-AQUI') || uri.includes('USUARIO:CLAVE')) {
  console.error('\n  MONGODB_URI sigue sin rellenar en .env.vercel\n');
  process.exit(1);
}
if (/\/\/(localhost|127\.0\.0\.1|mongo)[:/]/.test(uri)) {
  console.error('\n  Esa MONGODB_URI apunta a una base local, no a Atlas.\n');
  process.exit(1);
}

// Sin la clave: la cadena de Atlas la lleva dentro.
const sinClave = uri.replace(/\/\/[^@/]*@/, '//');
const soloDemo = process.argv.includes('demo');
const conDatos = process.argv.includes('datos');

(async () => {
  const env = require('../src/config/env');
  const { connectWithRetry, mongoose } = require('../src/config/database');
  const { enSesion } = require('../src/config/contexto');
  const models = require('../src/models');
  const { run } = require('../src/seed/bootstrap');

  console.log('');
  console.log(`  Base:   ${sinClave}`);
  console.log(`  Nombre: ${env.db.name}`);
  console.log('');

  await connectWithRetry(5, 2000);

  const contar = async () => {
    const linea = [];
    for (const k of ['Student', 'Payment', 'Sale', 'PersonalPayment']) {
      linea.push(`${k} ${await models[k].countDocuments()}`);
    }
    return linea.join('   ');
  };

  if (soloDemo) {
    const { sembrar, vaciar } = require('./sembrar-demo');
    console.log('  Esto rehace el cajon de pruebas. Los datos de la academia no se tocan:');
    console.log('  las consultas de esta orden solo alcanzan lo marcado como de la visita.');
    await enSesion(true, () => (conDatos ? sembrar() : vaciar()));
  } else {
    /*
     * Indices. Se piden aqui y no en cada arranque porque sobre colecciones
     * grandes tardan y bloquean escrituras mientras corren.
     */
    const colecciones = Object.keys(models).filter((k) => models[k]?.syncIndexes);
    for (const k of colecciones) await models[k].syncIndexes();
    console.log(`  Indices listos en ${colecciones.length} colecciones`);

    // Las cuentas definidas en el entorno, la de visita incluida.
    console.log('');
    await run({ silent: false });

    if (conDatos) {
      const { importData, hasDataset, isEmpty } = require('../src/seed/dataset');
      console.log('');
      if (!hasDataset()) {
        console.log('  No hay seed guardado (src/seed/data.json): nada que subir');
      } else if (!(await isEmpty())) {
        console.log('  La base YA tiene datos: el seed no se aplica, para no duplicar');
      } else {
        const { counts } = await importData();
        const total = Object.values(counts).reduce((a, n) => a + n, 0);
        console.log(`  Datos subidos: ${total} registros`);
        console.log(`  ${JSON.stringify(counts)}`);
      }
    }
  }

  // Lo que quedo dentro, para poder comprobarlo de un vistazo. Los dos
  // mundos por separado, que es justo lo que hay que poder mirar.
  console.log('');
  console.log('  Asi queda:');
  console.log(`    academia   ${await enSesion(false, contar)}`);
  console.log(`    visita     ${await enSesion(true, contar)}`);
  console.log(`    cuentas    ${await models.User.countDocuments()}`);

  if (!soloDemo) {
    console.log('');
    console.log('    npm run atlas:demo             borra lo que haya creado la visita');
    console.log('    npm run atlas:demo -- datos    y le deja registros inventados');
  }
  console.log('');

  await mongoose.disconnect();
})().catch((error) => {
  console.error(`\n  Error: ${error.message}`);
  if (/Authentication failed/i.test(error.message)) {
    console.error('  Revisa el usuario y la clave dentro de la cadena de Atlas.');
  }
  if (/ETIMEOUT|querySrv|ENOTFOUND|timed out/i.test(error.message)) {
    console.error('  Revisa en Atlas: Network Access tiene que permitir 0.0.0.0/0,');
    console.error('  porque las funciones de Vercel no tienen IP fija.');
  }
  console.error('');
  process.exit(1);
});
