const app = require('./app');
const env = require('./config/env');
const { connectWithRetry, mongoose } = require('./config/database');
require('./models');

async function bootstrap() {
  try {
    // Antes de abrir el puerto: en produccion, un secreto por defecto o un
    // CORS con comodin impiden arrancar. Vale mas no subir que subir abierto.
    require('./config/checkEnv').assertProductionConfig();

    await connectWithRetry();

    /*
     * Mongo no tiene esquema que crear: una coleccion aparece sola al
     * escribir en ella. Lo que si hay que aplicar cuando cambian los modelos
     * son los indices, y eso puede tardar sobre colecciones grandes y bloquea
     * escrituras mientras corre, asi que se pide a proposito.
     */
    if (env.dbSyncIndexes) {
      const models = require('./models');
      const nombres = Object.keys(models).filter((k) => models[k]?.syncIndexes);
      await Promise.all(nombres.map((k) => models[k].syncIndexes()));
      console.log(`[db] Indices sincronizados (${nombres.length} colecciones)`);
    }

    // Garantiza las cuentas definidas en el entorno; no carga datos de ejemplo.
    const { run } = require('./seed/bootstrap');
    await run({ silent: false });

    // Deja el mes en curso con la mensualidad emitida a todos los alumnos
    // activos, y lo vuelve a comprobar cada pocas horas por si cambia el mes
    // sin que el contenedor se reinicie.
    const { startAutoCharges } = require('./services/monthlyCharges');
    startAutoCharges();

    app.listen(env.port, '0.0.0.0', () => {
      console.log('');
      console.log('  API Academia lista');
      console.log(`  Entorno   : ${env.nodeEnv}`);
      console.log(`  API       : http://localhost:${env.port}/api`);
      console.log(`  Swagger   : http://localhost:${env.port}/api/docs`);
      console.log('');
    });
  } catch (error) {
    console.error('[fatal] No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
}

// Cerrar bien la conexion al parar el contenedor, en vez de dejarla colgando.
['SIGTERM', 'SIGINT'].forEach((senal) => {
  process.on(senal, async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

bootstrap();
