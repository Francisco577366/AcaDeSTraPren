/* eslint-disable no-console */
/**
 * Deja lista la base de Atlas: indices, cuentas y, si se pide, los datos.
 *
 *   npm run atlas:preparar           indices y cuentas
 *   npm run atlas:preparar -- datos  y ademas sube el seed
 *
 * Lee la configuracion de .env.vercel, que es la misma que pusiste en Vercel,
 * para que la cadena de conexion no haya que escribirla otra vez y no pueda
 * teclearse mal.
 *
 * Hace falta porque en serverless no hay arranque: src/server.js, que es quien
 * crea las cuentas y los indices en un servidor normal, alli nunca corre.
 *
 * Nada de lo que hace borra: bootstrap no pisa una cuenta existente ni su
 * contrasena, y el seed solo anade.
 */
const fs = require('fs');
const path = require('path');

/*
 * Que entorno preparar. Sin argumento, el de produccion; con 'demo', el de
 * la demostracion, que vive en otra base y tiene su propio fichero.
 */
const esDemo = process.argv.includes('demo');
const FICHERO = path.join(__dirname, '..', '..', esDemo ? '.env.vercel.demo' : '.env.vercel');

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
if (!uri || uri.includes('PEGA-AQUI')) {
  console.error('\n  MONGODB_URI sigue sin rellenar en .env.vercel\n');
  process.exit(1);
}
if (/\/\/(localhost|127\.0\.0\.1|mongo)[:/]/.test(uri)) {
  console.error('\n  Esa MONGODB_URI apunta a una base local, no a Atlas.\n');
  process.exit(1);
}

// Sin la clave: la cadena de Atlas la lleva dentro.
const sinClave = uri.replace(/\/\/[^@/]*@/, '//');
const conDatos = process.argv.includes('datos');

(async () => {
  const { connectWithRetry, mongoose } = require('../src/config/database');
  const models = require('../src/models');
  const { run } = require('../src/seed/bootstrap');

  console.log('');
  console.log(`  Base:  ${sinClave}`);
  console.log(`  Nombre: ${process.env.DB_NAME}`);
  console.log('');

  await connectWithRetry(5, 2000);

  // 1. Indices. Se piden aqui y no en cada arranque porque sobre colecciones
  // grandes tardan y bloquean escrituras mientras corren.
  const colecciones = Object.keys(models).filter((k) => models[k]?.syncIndexes);
  for (const k of colecciones) await models[k].syncIndexes();
  console.log(`  Indices listos en ${colecciones.length} colecciones`);

  // 2. Las cuentas definidas en el entorno.
  console.log('');
  await run({ silent: false });

  // 3. Los datos de la academia, solo si se pide.
  // La demo no usa el seed de la academia: sus datos son inventados.
  if (esDemo) {
    const { sembrar } = require('./sembrar-demo');
    await sembrar();
  }

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

  // Lo que quedo dentro, para poder comprobarlo de un vistazo.
  console.log('');
  console.log('  Asi queda la base:');
  for (const k of ['User', 'Student', 'Payment', 'Sale']) {
    console.log(`    ${k.padEnd(10)} ${await models[k].countDocuments()}`);
  }
  if (!conDatos) {
    console.log('');
    console.log('  Para subir ademas los datos de la academia:');
    console.log('    npm run atlas:preparar -- datos');
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
