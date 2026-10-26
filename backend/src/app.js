const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const limites = require('./middlewares/rateLimit');
const limpiarRespuesta = require('./middlewares/limpiarRespuesta');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

/**
 * La API va siempre detras de un proxy (nginx, Vercel, Cloudflare). Sin esto
 * req.ip es la IP del proxy, siempre la misma, y el limite por IP se
 * aplicaria a todos los usuarios como si fueran uno.
 */
app.set('trust proxy', env.trustProxy);
// No hace falta anunciar con que esta hecho el servidor.
app.disable('x-powered-by');

/**
 * La API solo responde JSON, asi que su CSP puede ser la mas cerrada que
 * existe: nada de nada. La unica excepcion es Swagger, que necesita cargar
 * sus propios estilos y scripts, y se monta con su CSP aparte mas abajo.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    // Un ano de HSTS. La API se sirve por https en cualquiera de los dos
    // destinos previstos, asi que no hay riesgo de bloquearse fuera.
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

/**
 * CORS contra una lista blanca. Importa mas de lo habitual porque el frontend
 * vive en otro dominio: si aqui entra un comodin, cualquier web podria llamar
 * a la API con la sesion del usuario.
 */
app.use(
  cors({
    origin: (origin, callback) => {
      // Sin Origin son peticiones del propio servidor o de herramientas como
      // curl, que no tienen sesion de navegador que robar.
      if (!origin || env.corsOrigin.includes(origin)) return callback(null, true);
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
    maxAge: 86400,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.use('/api', limites.general);
// Nada sale con el _id de Mongo dentro (ver el middleware).
app.use('/api', limpiarRespuesta);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Dashboard]
 *     summary: Estado del servicio
 *     security: []
 *     responses:
 *       200: { description: El API responde correctamente }
 */
app.get('/api/health', (req, res) => {
  // Solo lo justo para un monitor: ni entorno ni version ni configuracion.
  res.json({ success: true, service: 'academia-api', time: new Date().toISOString() });
});

/**
 * Documentacion interactiva. Fuera de produccion por defecto: describe cada
 * ruta, cada campo y cada rol, que es un mapa regalado para quien quiera
 * buscarle las vueltas a la API.
 */
if (env.docsEnabled) {
  /* eslint-disable global-require */
  const swaggerUi = require('swagger-ui-express');
  const { swaggerSpec, swaggerUiOptions } = require('./config/swagger');
  /* eslint-enable global-require */

  // Swagger si necesita estilos y scripts propios, asi que se le afloja la
  // CSP solo a el y solo hasta su propio origen.
  const cspSwagger = helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
  });

  app.use('/api/docs', cspSwagger, swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));
}

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({ success: true, message: 'API Administrativa de la Academia' });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
