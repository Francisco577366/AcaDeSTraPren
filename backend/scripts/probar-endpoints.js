/* eslint-disable no-console */
/**
 * Recorre TODAS las rutas del API y comprueba que ninguna deje pasar sin
 * token.
 *
 *   npm run probar:endpoints
 *
 * No es una lista escrita a mano: el script pregunta a Express que rutas
 * tiene montadas y las prueba una por una. Asi una ruta nueva entra sola en
 * la auditoria, que es justo lo que no pasa con una lista que hay que
 * acordarse de actualizar.
 *
 * De cada una se prueban tres entradas:
 *
 *   1. Sin cabecera Authorization        -> tiene que ser 401
 *   2. Con un token inventado            -> 401
 *   3. Con un token firmado con OTRA clave -> 401
 *
 * La tercera es la que de verdad importa: comprueba que el servidor verifica
 * la FIRMA y no solo que el token tenga pinta de token. Un token bien formado
 * con los datos del administrador dentro, firmado con otro secreto, tiene que
 * rebotar igual.
 *
 * Las publicas a proposito van en la lista de abajo, y se comprueba que NO
 * den 401, para que la auditoria no se las salte en silencio.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'academia_prueba_endpoints';
process.env.SEED_ON_START = 'false';
process.env.AUTO_MONTHLY_CHARGES = 'false';
process.env.JWT_SECRET = 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b';
process.env.RATE_LIMIT_MAX = '100000';
process.env.LOGIN_RATE_LIMIT_MAX = '100000';
process.env.ADMIN_EMAIL = 'admin@academia.com';
process.env.ADMIN_PASSWORD = 'Clave-Admin-Larga-2026';
process.env.CRON_SECRET = 'secreto-del-cron-para-la-prueba-2026';
process.env.API_DOCS_ENABLED = 'false';

const jwt = require('jsonwebtoken');
const { connectWithRetry, mongoose } = require('../src/config/database');
const app = require('../src/app');

let fallos = 0;
const ok = (c, t) => {
  console.log(`${c ? '  OK   ' : '  FALLA'} ${t}`);
  if (!c) fallos += 1;
};

const PUERTO = 4802;
const BASE = `http://127.0.0.1:${PUERTO}`;

/**
 * Rutas que NO exigen token, y por que.
 *
 * Cada una esta aqui a proposito y con su motivo escrito. Si manana aparece
 * una ruta abierta que no este en esta lista, la auditoria la saca.
 */
const PUBLICAS = [
  ['GET', '/api/health', 'un monitor tiene que poder preguntar si el proceso vive'],
  ['POST', '/api/auth/login', 'es la puerta: pedir token para pedir token no tendria sentido'],
];

/** Rutas protegidas por el secreto del cron, no por un token de usuario. */
const DE_CRON = ['/api/cron/'];

/* ------------------------------------------------------------------ */
/* Sacarle a Express la lista de rutas                                 */
/* ------------------------------------------------------------------ */

/**
 * Reconstruye el prefijo de un router a partir de su expresion regular.
 *
 * Express no guarda el path con el que se monto un router, solo la regular
 * que genero. Deshacerla es feo pero es la unica forma de saber donde vive
 * cada ruta sin escribir la lista a mano.
 */
function prefijoDe(capa) {
  if (capa.path) return capa.path;
  const fuente = capa.regexp && capa.regexp.source;
  if (!fuente) return '';
  const limpio = fuente
    .replace('^\\/', '/')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/')
    .replace(/\$$/, '')
    .replace(/\(\?=.*$/, '')
    .replace(/\?$/, '');
  return limpio === '/' ? '' : limpio;
}

/** Todas las rutas montadas, como [metodo, path]. */
function rutasDe(aplicacion) {
  const salida = [];

  const recorrer = (capas, prefijo) => {
    capas.forEach((capa) => {
      if (capa.route) {
        const path = prefijo + capa.route.path;
        Object.keys(capa.route.methods)
          .filter((m) => m !== '_all')
          .forEach((metodo) => salida.push([metodo.toUpperCase(), path]));
      } else if (capa.name === 'router' && capa.handle && capa.handle.stack) {
        recorrer(capa.handle.stack, prefijo + prefijoDe(capa));
      }
    });
  };

  recorrer(aplicacion._router.stack, '');
  return salida;
}

/** Un path con :parametros, relleno con valores que existen seguro. */
const concretar = (path) => path.replace(/:[^/]+/g, '1');

(async () => {
  await connectWithRetry(5, 1000);
  await mongoose.connection.dropDatabase();

  const servidor = app.listen(PUERTO);

  const pedir = async (metodo, path, token) => {
    try {
      const r = await fetch(BASE + path, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Un cuerpo vacio basta: si la ruta llegara a ejecutarse, fallaria por
        // validacion (400) y eso ya seria un agujero.
        body: ['POST', 'PUT', 'PATCH'].includes(metodo) ? '{}' : undefined,
      });
      return r.status;
    } catch (error) {
      return `error: ${error.message}`;
    }
  };

  try {
    const rutas = rutasDe(app)
      .filter(([, path]) => path.startsWith('/api'))
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

    const esPublica = (metodo, path) =>
      PUBLICAS.some(([m, p]) => m === metodo && p === path);
    const esDeCron = (path) => DE_CRON.some((p) => path.startsWith(p));

    const protegidas = rutas.filter(
      ([m, p]) => !esPublica(m, p) && !esDeCron(p)
    );

    console.log(`\n  ${rutas.length} rutas montadas: ${protegidas.length} deben exigir token,`);
    console.log(`  ${PUBLICAS.length} publicas a proposito y ${rutas.length - protegidas.length - PUBLICAS.length} del cron.\n`);

    /* ---- 1. Sin token ---- */
    console.log('1. Sin cabecera Authorization');
    const coladas = [];
    const escritura = [];
    for (const [metodo, path] of protegidas) {
      const estado = await pedir(metodo, concretar(path));
      if (estado !== 401) coladas.push([metodo, path, estado]);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) escritura.push([metodo, path]);
    }
    ok(coladas.length === 0, `${protegidas.length} rutas probadas, ${coladas.length} dejaron pasar`);
    coladas.forEach(([m, p, e]) => console.log(`         ${m} ${p} -> ${e}`));
    console.log(`         de ellas, ${escritura.length} crean, modifican o borran`);

    /* ---- 2. Token inventado ---- */
    console.log('\n2. Con un token inventado');
    const basura = [];
    for (const [metodo, path] of protegidas) {
      const estado = await pedir(metodo, concretar(path), 'esto-no-es-un-token');
      if (estado !== 401) basura.push([metodo, path, estado]);
    }
    ok(basura.length === 0, `${basura.length} dejaron pasar`);
    basura.forEach(([m, p, e]) => console.log(`         ${m} ${p} -> ${e}`));

    /* ---- 3. Token bien formado pero firmado con otra clave ---- */
    console.log('\n3. Con un token de administrador firmado con OTRA clave');
    const falso = jwt.sign({ sub: 1, role: 'admin' }, 'la-clave-del-atacante-que-no-es-la-nuestra', {
      expiresIn: '1h',
      algorithm: 'HS256',
    });
    const firmados = [];
    for (const [metodo, path] of protegidas) {
      const estado = await pedir(metodo, concretar(path), falso);
      if (estado !== 401) firmados.push([metodo, path, estado]);
    }
    ok(firmados.length === 0, `${firmados.length} dejaron pasar`);
    firmados.forEach(([m, p, e]) => console.log(`         ${m} ${p} -> ${e}`));

    /* ---- 4. Token caducado ---- */
    console.log('\n4. Con un token caducado, firmado con la clave buena');
    const caducado = jwt.sign({ sub: 1, role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: '-1h',
      algorithm: 'HS256',
    });
    const viejos = [];
    for (const [metodo, path] of protegidas) {
      const estado = await pedir(metodo, concretar(path), caducado);
      if (estado !== 401) viejos.push([metodo, path, estado]);
    }
    ok(viejos.length === 0, `${viejos.length} dejaron pasar`);
    viejos.forEach(([m, p, e]) => console.log(`         ${m} ${p} -> ${e}`));

    /* ---- 5. Token con algoritmo "none" ---- */
    console.log('\n5. Con un token de algoritmo "none" (sin firma)');
    const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const cuerpo = Buffer.from(
      JSON.stringify({ sub: 1, role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const sinFirma = `${cabecera}.${cuerpo}.`;
    const estadoNone = await pedir('GET', '/api/students', sinFirma);
    ok(estadoNone === 401, `GET /api/students -> ${estadoNone}`);
    console.log('         es el ataque clasico: decirle al servidor que no verifique');

    /* ---- 6. Las publicas siguen abiertas ---- */
    console.log('\n6. Y las que deben estar abiertas, lo siguen estando');
    for (const [metodo, path, motivo] of PUBLICAS) {
      const estado = await pedir(metodo, path);
      ok(estado !== 401, `${metodo} ${path} -> ${estado}`);
      console.log(`         ${motivo}`);
    }

    /* ---- 7. El cron no se abre sin su secreto ---- */
    console.log('\n7. Las del cron piden su secreto, no un token');
    for (const [metodo, path] of rutas.filter(([, p]) => esDeCron(p))) {
      const estado = await pedir(metodo, concretar(path));
      ok(estado === 401 || estado === 403, `${metodo} ${path} -> ${estado}`);
    }
  } finally {
    servidor.close();
    await mongoose.disconnect();
  }

  console.log(`\n${fallos === 0 ? '  TODO EN ORDEN' : `  ${fallos} FALLO(S)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((error) => {
  console.error(`\n  Error: ${error.message}\n`);
  process.exit(1);
});
