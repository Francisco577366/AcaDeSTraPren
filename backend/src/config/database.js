const mongoose = require('mongoose');
const env = require('./env');

/**
 * Conexion a MongoDB, cacheada entre invocaciones.
 *
 * Esto es lo que hace que la base aguante en serverless. Alli cada peticion
 * puede caer en una instancia distinta, y abrir una conexion nueva por
 * peticion agota el limite del servidor en cuanto hay algo de trafico. La
 * cache vive en el objeto global, que SI sobrevive entre invocaciones de la
 * misma instancia tibia: la primera peticion conecta y las siguientes
 * reutilizan esa conexion.
 *
 * Tambien se guarda la PROMESA, no solo la conexion. Si llegan dos peticiones
 * a la vez con la instancia fria, las dos entran aqui antes de que ninguna
 * haya terminado de conectar; guardando la promesa, la segunda espera a la
 * primera en vez de abrir una segunda conexion.
 */
const cache = global.__mongoose || (global.__mongoose = { conn: null, promise: null });

const opciones = {
  // Nombrar la base aqui evita depender de que venga en la URI.
  dbName: env.db.name,
  // Cuanto esperar a que haya un servidor disponible antes de rendirse.
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  /**
   * Conexiones por instancia. En un servidor normal 10 esta bien; en
   * serverless cada instancia abre su propio pool, asi que conviene 2.
   */
  maxPoolSize: env.db.poolMax,
  minPoolSize: 0,
  // Suelta las conexiones ociosas: en serverless una instancia puede quedarse
  // congelada con el pool abierto sin volver a usarlo.
  maxIdleTimeMS: 60000,
  retryWrites: true,
};

/** Conecta, o devuelve la conexion que ya estaba abierta. */
async function connect() {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    // strictQuery evita que un filtro con un campo que no existe en el esquema
    // se ignore en silencio y devuelva la coleccion entera.
    mongoose.set('strictQuery', true);
    if (env.nodeEnv === 'development') {
      mongoose.set('debug', (col, metodo, ...args) => {
        console.log(`[db] ${col}.${metodo}`, JSON.stringify(args[0] || {}));
      });
    }
    cache.promise = mongoose.connect(env.db.uri, opciones).then((m) => m.connection);
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    // Si falla, se tira la promesa para que el proximo intento vuelva a
    // probar en vez de quedarse pegado al fallo de la primera vez.
    cache.promise = null;
    throw error;
  }
  return cache.conn;
}

/**
 * Espera a la base con reintentos. Lo usa el arranque del servidor normal:
 * Mongo dentro de Docker puede tardar en aceptar conexiones.
 */
async function connectWithRetry(retries = 15, delayMs = 3000) {
  for (let intento = 1; intento <= retries; intento += 1) {
    try {
      await connect();
      console.log('[db] Conexion establecida con MongoDB');
      return;
    } catch (error) {
      console.warn(`[db] Intento ${intento}/${retries} fallido: ${error.message}`);
      if (intento === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Middleware que garantiza la conexion antes de atender la peticion.
 *
 * En serverless no hay arranque donde conectar: la primera peticion de cada
 * instancia tiene que hacerlo. Despues la cache responde al instante.
 */
function ensureDb(req, res, next) {
  connect().then(() => next()).catch(next);
}

module.exports = { mongoose, connect, connectWithRetry, ensureDb };
