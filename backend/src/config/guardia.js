/* eslint-disable no-console */
const env = require('./env');

/**
 * Describe contra que base se va a trabajar, sin revelar la contrasena.
 *
 * Una URI de Atlas lleva el usuario y la clave dentro, asi que no se puede
 * imprimir tal cual en un log ni en un mensaje de error.
 */
function describirBase() {
  const uri = String(env.db.uri || '');
  const sinCredenciales = uri.replace(/\/\/[^@/]*@/, '//');
  const local = /\/\/(localhost|127\.0\.0\.1|mongo)[:/]|\/\/mongo$/.test(uri);
  return { texto: `${sinCredenciales} (base ${env.db.name})`, local };
}

/**
 * Corta una operacion destructiva si la base no es local.
 *
 * Esto existe por un accidente concreto y muy facil de tener: abrir una
 * terminal con las variables de produccion cargadas y lanzar `npm run
 * seed:restore`, que BORRA todo y recarga el fichero. Contra la base de la
 * academia eso es perder los cobros de verdad.
 *
 * La regla es simple: lo que destruye datos solo corre contra una base local.
 * Si de verdad hay que hacerlo contra la de produccion (restaurar un
 * respaldo despues de un desastre), hay que decirlo a proposito con
 * PERMITIR_BASE_REMOTA=true, que no se pone por descuido.
 *
 * @param {string} operacion  Como se llama lo que se iba a hacer.
 */
function asegurarBaseLocal(operacion) {
  const { texto, local } = describirBase();

  if (local) return true;

  if (String(process.env.PERMITIR_BASE_REMOTA || '') === 'true') {
    console.warn('');
    console.warn('  ====================================================');
    console.warn(`  ATENCION: "${operacion}" sobre una base REMOTA`);
    console.warn(`  ${texto}`);
    console.warn('  Autorizado con PERMITIR_BASE_REMOTA=true');
    console.warn('  ====================================================');
    console.warn('');
    return true;
  }

  console.error('');
  console.error(`  La orden "${operacion}" se detuvo: la base no es local.`);
  console.error(`  Apunta a ${texto}`);
  console.error('');
  console.error('  Esta orden borra o sobrescribe datos. Contra la base de la');
  console.error('  academia eso seria perder cobros reales.');
  console.error('');
  console.error('  Si trabajas en local, levanta el entorno local primero:');
  console.error('    docker compose up -d');
  console.error('');
  console.error('  Si de verdad quieres hacerlo contra esa base (restaurar un');
  console.error('  respaldo), dilo a proposito:');
  console.error(`    PERMITIR_BASE_REMOTA=true npm run ${operacion}`);
  console.error('');
  process.exit(1);
  return false;
}

module.exports = { asegurarBaseLocal, describirBase };
