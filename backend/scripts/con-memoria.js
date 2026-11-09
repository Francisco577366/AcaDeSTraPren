/* eslint-disable no-console */
/**
 * Lanza una suite de pruebas contra un Mongo que seguro existe.
 *
 *   node scripts/con-memoria.js probar-api.js
 *
 * Primero mira si hay un Mongo escuchando (el del docker compose). Si no lo
 * hay, levanta uno EN MEMORIA y apunta ahi las pruebas.
 *
 * Existe porque las suites dependian de tener el contenedor arriba, y una
 * prueba que solo corre cuando se acuerda uno de levantar Docker es una
 * prueba que no corre. En memoria tarda unos segundos mas en arrancar y no
 * hace falta nada instalado.
 *
 * El Mongo en memoria es un replica set de un nodo a proposito: dar de alta
 * un alumno abre una transaccion, y las transacciones no existen en un Mongo
 * suelto.
 */
const net = require('net');
const path = require('path');

const SUITE = process.argv[2];
if (!SUITE) {
  console.error('\n  Uso: node scripts/con-memoria.js <fichero-de-la-suite>\n');
  process.exit(1);
}

/** Si hay algo escuchando en ese puerto, sin llegar a hablar Mongo. */
const hayPuerto = (puerto, host) =>
  new Promise((resolve) => {
    const socket = net.connect({ port: puerto, host });
    const cerrar = (resultado) => {
      socket.destroy();
      resolve(resultado);
    };
    socket.setTimeout(1000);
    socket.on('connect', () => cerrar(true));
    socket.on('timeout', () => cerrar(false));
    socket.on('error', () => cerrar(false));
  });

(async () => {
  /*
   * EN MEMORIA salvo que se pida otra cosa a proposito.
   *
   * La tentacion es usar el Mongo del docker compose si esta levantado, que
   * arranca antes. Pero estas suites borran bases enteras, y ese Mongo tiene
   * los alumnos de verdad: basta un DB_NAME mal puesto en una suite para
   * perderlos. En memoria no hay nada que perder.
   *
   * Para correrlas contra un Mongo concreto, se dice en voz alta:
   *   MONGODB_URI=mongodb://localhost:27017 npm run probar:api
   */
  if (!process.env.MONGODB_URI) {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    console.log('\n  Mongo en memoria (no toca ninguna base de verdad)...');
    const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replica.getUri();
    // La suite termina con process.exit, que se lleva por delante el proceso
    // del Mongo en memoria. No hay nada que cerrar a mano.
  } else if (await hayPuerto(27017, '127.0.0.1')) {
    console.log('\n  Mongo indicado por MONGODB_URI');
  }

  // El require va DESPUES de fijar la URI: las suites leen la configuracion
  // al importarse.
  require(path.resolve(__dirname, SUITE));
})().catch((error) => {
  console.error(`\n  Error: ${error.message}\n`);
  process.exit(1);
});
