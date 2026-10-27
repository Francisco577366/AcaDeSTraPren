/* eslint-disable no-console */
/**
 * Revision previa al despliegue.
 *
 *   npm run revisar:produccion
 *
 * Comprueba lo que se puede comprobar desde aqui: configuracion, secretos,
 * dependencias, ficheros que no deben viajar y puertas que deben estar
 * cerradas. Lo que depende del proveedor (variables en Vercel, la IP de
 * Atlas) no lo puede saber este script, y se lista aparte como pendiente.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * npm audit sale con codigo distinto de cero cuando encuentra algo, asi que
 * execFileSync lanza. Lo que interesa es el informe, no el codigo.
 */
function auditar(cwd) {
  try {
    return JSON.parse(execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd, encoding: 'utf8', shell: true }));
  } catch (error) {
    return JSON.parse(error.stdout || '{}');
  }
}

const RAIZ = path.join(__dirname, '..', '..');
const BACK = path.join(RAIZ, 'backend');

let fallos = 0;
let avisos = 0;
const ok = (c, t, detalle = '') => {
  console.log(`  ${c ? 'OK  ' : 'MAL '} ${t}${detalle ? ` -- ${detalle}` : ''}`);
  if (!c) fallos += 1;
};
const aviso = (t) => { console.log(`  ..   ${t}`); avisos += 1; };
const titulo = (t) => console.log(`\n${t}`);

const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

/* ------------------------------------------------------------------ */
titulo('1. Secretos y configuracion');

const PUBLICOS = ['Admin123*', 'Usuario123*', 'secreto-dev', 'cambia-este-secreto-en-produccion',
  'solo-para-desarrollo-local-no-sirve-en-produccion', 'solo-para-la-demo-local-no-sirve-en-produccion'];

{
  // La revision real, la misma que corre al arrancar.
  const antes = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'production',
    JWT_SECRET: 'f3a9c1d7e5b2048a6c9f1e3d7b5a208c4e6f9a1b3d5c7e9f0a2b4c6d8e0f1a3b',
    ADMIN_EMAIL: 'admin@academia.com',
    ADMIN_PASSWORD: 'Una-Clave-Larga-De-Verdad',
    CORS_ORIGIN: 'https://academia.example.com',
    MONGODB_URI: 'mongodb+srv://u:p@c.abc.mongodb.net/',
    DB_NAME: 'academia',
  });
  delete process.env.DEMO_EMAIL;
  delete process.env.DEMO_PASSWORD;
  delete process.env.USUARIO_EMAIL;
  delete process.env.USUARIO_PASSWORD;
  Object.keys(require.cache).forEach((k) => { if (k.includes('acadestrapren')) delete require.cache[k]; });

  const { revisar } = require('../src/config/checkEnv');
  const r = revisar();
  ok(r.problemas.length === 0 && r.graves.length === 0,
    'una configuracion de produccion valida pasa la revision',
    [...r.graves, ...r.problemas].join(' | '));

  // Y una mala, no.
  process.env.JWT_SECRET = 'secreto-dev';
  Object.keys(require.cache).forEach((k) => { if (k.includes('acadestrapren')) delete require.cache[k]; });
  const malo = require('../src/config/checkEnv').revisar();
  ok(malo.problemas.some((p) => /JWT_SECRET/.test(p)), 'un secreto por defecto la bloquea');

  Object.keys(process.env).forEach((k) => delete process.env[k]);
  Object.assign(process.env, antes);
  Object.keys(require.cache).forEach((k) => { if (k.includes('acadestrapren')) delete require.cache[k]; });
}

{
  const plantilla = leer('.env.production.example');
  const vacias = ['JWT_SECRET=', 'ADMIN_EMAIL=', 'ADMIN_PASSWORD=', 'CRON_SECRET='];
  ok(vacias.every((v) => plantilla.includes(`\n${v}\n`) || plantilla.includes(`\n${v}\r`)),
    'la plantilla de produccion no trae secretos rellenos');
  ok(!PUBLICOS.some((p) => plantilla.includes(p)),
    'ni ninguna de las claves de desarrollo');
}

/* ------------------------------------------------------------------ */
titulo('2. Nada sensible viaja al repositorio');

{
  const gi = leer('.gitignore');
  ok(/^\.env$/m.test(gi) && /^\.env\.\*$/m.test(gi), '.env y .env.* estan ignorados');
  ok(gi.includes('backend/src/seed/data.json'), 'el seed con los datos reales esta ignorado');
  ok(/^!\.env\.example$/m.test(gi) && /^!\.env\.production\.example$/m.test(gi),
    'las plantillas si suben');

  const di = leer('backend/.dockerignore');
  ok(di.includes('src/seed/data.json'), 'el seed no entra en la imagen');
  ok(di.includes('.env'), 'los .env tampoco');

  const vi = existe('backend/.vercelignore') ? leer('backend/.vercelignore') : '';
  ok(vi.includes('src/seed/data.json'), 'ni se despliega a Vercel');
}

/* ------------------------------------------------------------------ */
titulo('3. Dependencias');

{
  const informe = auditar(BACK);
  const v = informe.metadata.vulnerabilities;
  const total = v.critical + v.high + v.moderate + v.low;
  ok(total === 0, `backend sin vulnerabilidades de produccion`, total ? JSON.stringify(v) : '');

  const pkg = JSON.parse(leer('backend/package.json'));
  ok(!pkg.dependencies.sequelize && !pkg.dependencies.mysql2,
    'no quedan dependencias de la base anterior');
  ok(!!pkg.dependencies.mongoose, 'mongoose declarado');
  ok(existe('backend/package-lock.json') && existe('frontend/package-lock.json'),
    'los dos proyectos tienen lockfile');
}

{
  const informe = auditar(path.join(RAIZ, 'frontend'));
  const v = informe.metadata.vulnerabilities;
  const total = v.critical + v.high + v.moderate + v.low;
  ok(total === 0, 'frontend sin vulnerabilidades de produccion', total ? JSON.stringify(v) : '');
}

/* ------------------------------------------------------------------ */
titulo('4. Lo que queda de la migracion');

{
  const ficheros = [];
  const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (e.name.endsWith('.js')) ficheros.push(p);
  });
  recorrer(path.join(BACK, 'src'));

  const sospechosos = ficheros.filter((f) => {
    const t = fs.readFileSync(f, 'utf8');
    return /\.(findAll|findByPk|findAndCountAll|bulkCreate)\(/.test(t)
      || /require\('sequelize'\)/.test(t);
  });
  ok(sospechosos.length === 0, 'ni un metodo de Sequelize vivo',
    sospechosos.map((f) => path.basename(f)).join(', '));

  // Acentos en el codigo: el proyecto los reserva para el README.
  const conAcentos = ficheros.filter((f) => /[^\x00-\x7F]/.test(fs.readFileSync(f, 'utf8')));
  if (conAcentos.length) aviso(`con caracteres no ASCII: ${conAcentos.map((f) => path.basename(f)).join(', ')}`);
  else ok(true, 'el codigo del backend es ASCII');
}

/* ------------------------------------------------------------------ */
titulo('5. Despliegue');

{
  ok(existe('backend/api/index.js'), 'hay entrada para serverless (Vercel)');
  // En serverless no hay arranque que conecte: si la aplicacion no garantiza
  // la conexion por peticion, todo lo que toque la base se cae a los diez
  // segundos con un 'buffering timed out' que no dice que falte la conexion.
  ok(leer('backend/src/app.js').includes("app.use('/api', ensureDb)"),
    'la aplicacion garantiza la conexion a la base en cada peticion');
  const vercel = JSON.parse(leer('backend/vercel.json'));
  ok(Array.isArray(vercel.crons) && vercel.crons.length > 0,
    'el cron de mensualidades esta declarado', vercel.crons?.[0]?.schedule);
  ok(vercel.rewrites?.length > 0, 'las rutas apuntan al handler');

  ok(existe('docker-compose.yml') && existe('docker-compose.prod.yml'),
    'los dos entornos tienen su compose');
  const local = leer('docker-compose.yml');
  const prod = leer('docker-compose.prod.yml');
  ok(local.includes('name: acade-local') && prod.includes('name: acade-prod'),
    'con nombres de proyecto distintos, para que no se pisen');
  ok(local.includes('--replSet'), 'el Mongo local es replica set (hacen falta transacciones)');
  ok(prod.includes('MONGODB_URI:?') || /MONGODB_URI: \$\{MONGODB_URI:\?/.test(prod),
    'produccion exige MONGODB_URI, no se inventa una local');
  ok(!prod.includes('mongo-express'), 'produccion no publica panel de base de datos');

  const dockerBack = leer('backend/Dockerfile');
  ok(dockerBack.includes('npm ci'), 'la imagen de produccion instala desde el lockfile');
  ok(dockerBack.includes('USER node'), 'y no corre como root');
}

/* ------------------------------------------------------------------ */
titulo('6. Frontend');

{
  const vite = leer('frontend/vite.config.js');
  ok(vite.includes("script-src 'self'") && !vite.includes("script-src 'self' 'unsafe-inline'"),
    'la CSP no permite scripts en linea');
  ok(vite.includes('VITE_BASE_PATH'), 'el base path de GitHub Pages es configurable');
  ok(leer('frontend/src/main.jsx').includes('basename'), 'el router lo respeta');
}

/* ------------------------------------------------------------------ */
titulo('7. Pendiente de ti (no lo puede saber este script)');

[
  'Crear el cluster en Atlas y poner MONGODB_URI en Vercel',
  'Generar JWT_SECRET, ADMIN_PASSWORD, USUARIO_PASSWORD y CRON_SECRET nuevos',
  'Poner CORS_ORIGIN con el dominio exacto de GitHub Pages, sin barra final',
  'Subir el seed de la academia a Atlas (npm run seed:load contra la base real)',
  'Montar la demo como despliegue aparte, con su DB_NAME y sus DEMO_*',
  'Crear el repositorio con el .gitignore ya puesto',
].forEach(aviso);

/* ------------------------------------------------------------------ */
console.log('');
console.log('-'.repeat(70));
console.log(`  ${fallos === 0 ? 'LISTO para desplegar' : `${fallos} COSA(S) QUE ARREGLAR`} -- ${avisos} pendiente(s) tuyo(s)`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
