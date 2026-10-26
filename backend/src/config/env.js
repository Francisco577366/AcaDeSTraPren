require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  db: {
    /**
     * Cadena de conexion a MongoDB. En Atlas empieza por mongodb+srv:// y ya
     * lleva usuario, contrasena y TLS dentro, asi que ES UN SECRETO: va en
     * las variables del servidor, nunca en el repositorio.
     */
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    name: process.env.DB_NAME || 'academia',
    /**
     * Conexiones por instancia. En un servidor normal 10 esta bien; en
     * serverless cada instancia abre su propio pool, asi que conviene 2.
     */
    poolMax: Number(process.env.DB_POOL_MAX || 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'secreto-dev',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    /**
     * Se declara el algoritmo en vez de dejar que se deduzca del token: si no
     * se fija, quien envie el token elige con que se verifica.
     */
    algorithm: 'HS256',
  },
  /** Coste del hash de contrasenas. Cada punto duplica el tiempo de calculo. */
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  /** Longitud minima de una contrasena de usuario. */
  passwordMinLength: Number(process.env.PASSWORD_MIN_LENGTH || 12),
  /**
   * Swagger describe entera la superficie del API. Util mientras se desarrolla,
   * regalado en produccion, asi que por defecto solo se publica fuera de ella.
   */
  docsEnabled: process.env.API_DOCS_ENABLED
    ? process.env.API_DOCS_ENABLED === 'true'
    : process.env.NODE_ENV !== 'production',
  /**
   * Proxies de confianza delante de la API (nginx, Vercel, Cloudflare). Sin
   * esto req.ip es la IP del proxy y el limite por IP se aplicaria a todo el
   * mundo junto, que es tanto como no tenerlo.
   */
  trustProxy: Number(process.env.TRUST_PROXY || 1),
  rateLimit: {
    /** Ventana y tope del limite general, por IP. */
    windowMinutes: Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 15),
    max: Number(process.env.RATE_LIMIT_MAX || 600),
    /** El login va mucho mas apretado: es la puerta de la fuerza bruta. */
    loginWindowMinutes: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES || 15),
    loginMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 8),
  },
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),
  /**
   * Mongo no tiene esquema que sincronizar: una coleccion aparece sola al
   * escribir en ella, asi que el DB_SYNC_ALTER que hacia falta con MySQL ya
   * no existe. Lo que SI hay que aplicar cuando cambian los modelos son los
   * indices, y eso puede tardar sobre colecciones grandes, asi que se pide a
   * proposito en vez de correr en cada arranque.
   */
  dbSyncIndexes: String(process.env.DB_SYNC_INDEXES || 'false') === 'true',
  /**
   * Si la base arranca vacia y existe src/seed/data.json, se carga solo.
   * Ponlo en false para arrancar siempre en blanco.
   */
  seedOnStart: String(process.env.SEED_ON_START || 'true') === 'true',
  // Unico registro que crea el sistema al arrancar, para poder entrar.
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: process.env.ADMIN_EMAIL || 'admin@academia.com',
    password: process.env.ADMIN_PASSWORD || 'Admin123*',
  },
  /**
   * Cuenta del dia a dia: inscribe alumnos, cobra y vende en la libreria.
   * Si no se define una contrasena NO se crea, porque una cuenta con clave
   * conocida es peor que no tener la cuenta.
   */
  usuario: {
    name: process.env.USUARIO_NAME || 'Usuario',
    email: process.env.USUARIO_EMAIL || null,
    password: process.env.USUARIO_PASSWORD || null,
  },
  /**
   * Cuenta de demostracion: publica, compartida y de solo mirar y probar.
   * Igual que la anterior, sin contrasena definida NO se crea.
   *
   * Solo tiene sentido en el despliegue de la demo, contra su propia base.
   * Si aparece apuntando a la base real, el arranque lo rechaza: seria
   * publicar los datos de los alumnos.
   */
  demo: {
    name: process.env.DEMO_NAME || 'Demostracion',
    email: process.env.DEMO_EMAIL || null,
    password: process.env.DEMO_PASSWORD || null,
  },
  currency: process.env.CURRENCY || 'USD',
  /** Mensualidad estandar de la academia; el alta de alumnos parte de aqui. */
  baseMonthlyFee: Number(process.env.BASE_MONTHLY_FEE || 70),
  /** Inscripcion que propone el alta; 0 significa que no se cobra. */
  baseEnrollmentFee: Number(process.env.BASE_ENROLLMENT_FEE || 0),
  /** Dia del mes en que vence la mensualidad. */
  monthlyDueDay: Number(process.env.MONTHLY_DUE_DAY || 5),
  /**
   * Cada mes arranca con la mensualidad emitida a todos los alumnos activos,
   * sin tener que pulsar nada: un alumno debe su mes desde que el mes empieza.
   * Ponlo en false para emitirlas solo a mano desde Pagos.
   */
  autoMonthlyCharges: String(process.env.AUTO_MONTHLY_CHARGES || 'true') === 'true',
  /** Cada cuantas horas se comprueba si ya cambio el mes. */
  autoChargesCheckHours: Number(process.env.AUTO_CHARGES_CHECK_HOURS || 6),
  /**
   * Llave de las tareas programadas. En serverless no hay proceso que viva
   * entre peticiones, asi que el reloj llega de fuera llamando a /api/cron, y
   * esa ruta escribe en la base: sin llave configurada se queda cerrada.
   */
  cronSecret: process.env.CRON_SECRET || null,
  /** Alquiler mensual del local y como se paga. */
  baseRent: Number(process.env.BASE_RENT || 0),
  rentCurrency: process.env.RENT_CURRENCY || 'USD',
  rentDueDay: Number(process.env.RENT_DUE_DAY || 5),
  /** Lo que cobra un profesor por cada alumno, a la semana. */
  baseStudentRate: Number(process.env.BASE_STUDENT_RATE || 5),
  /** Semanas que se cuentan por mes al pasar el pago semanal a mensual. */
  weeksPerMonth: Number(process.env.WEEKS_PER_MONTH || 4),
  /** Dias de clase por semana; reparte el pago semanal en pago por dia. */
  daysPerWeek: Number(process.env.DAYS_PER_WEEK || 5),
  /** La libreria cobra en bolivares; el resto de la academia en la moneda base. */
  libraryCurrency: process.env.LIBRARY_CURRENCY || 'VES',
  /** Tasa oficial del BCV, en bolivares por dolar. */
  exchangeRateUrl: process.env.EXCHANGE_RATE_URL || 'https://ve.dolarapi.com/v1/dolares/oficial',
  exchangeRateTtlMinutes: Number(process.env.EXCHANGE_RATE_TTL_MINUTES || 360),
  exchangeRateTimeoutMs: Number(process.env.EXCHANGE_RATE_TIMEOUT_MS || 8000),
  /** Zona horaria de la academia; de aqui sale que dia es "hoy". */
  /*
   * La zona horaria DE LA ACADEMIA, que no es la del servidor.
   *
   * Sale de ACADEMY_TZ y NO de TZ, aunque TZ parezca lo natural. TZ la fija
   * la plataforma: Vercel la pone en UTC y ni siquiera deja cambiarla, porque
   * es un nombre reservado. Leyendo de ahi, un cobro registrado a las 22:00
   * en Caracas se guardaria con la fecha del dia siguiente, que es justo el
   * fallo que ya costo un mes de cobros mal fechados.
   *
   * Que el servidor corra en UTC esta bien y es lo normal; lo que no puede
   * es decidir en que dia vive la academia.
   */
  timezone: process.env.ACADEMY_TZ || 'America/Caracas',
  /**
   * Dia en que arranco la academia. El mes de arranque no se paga completo:
   * la nomina de ese periodo sale con las semanas que quedaron desde aqui.
   */
  academyStartDate: process.env.ACADEMY_START_DATE || '2026-09-15',
};

module.exports = env;
