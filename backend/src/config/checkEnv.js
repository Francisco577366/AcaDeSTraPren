/* eslint-disable no-console */
const env = require('./env');

/**
 * Valores que vienen escritos en el repositorio: en el .env.example, en el
 * docker-compose.yml o como valor por defecto del codigo. Quien tenga acceso
 * al proyecto los conoce, asi que en produccion no son secretos de nada.
 *
 * El JWT_SECRET es el peor de todos: con el se puede FIRMAR un token de
 * administrador sin pasar por el login.
 */
const PUBLICOS = {
  'jwt.secret': ['secreto-dev', 'cambia-este-secreto-en-produccion'],
  'admin.password': ['Admin123*'],
};

/** Longitudes minimas por debajo de las cuales no vale ni molestarse. */
const MINIMOS = {
  'jwt.secret': 32,
  'admin.password': 12,
};

const ETIQUETAS = {
  'jwt.secret': 'JWT_SECRET',
  'admin.password': 'ADMIN_PASSWORD',
};

/** Lee 'a.b' dentro del objeto de configuracion. */
const leer = (ruta) => ruta.split('.').reduce((o, k) => (o || {})[k], env);

/**
 * Revisa la configuracion antes de abrir el puerto.
 *
 * Fuera de produccion solo avisa, para no estorbar en desarrollo. En
 * produccion un secreto por defecto es una puerta abierta, asi que el
 * proceso se niega a arrancar: es mucho mejor que la aplicacion no suba que
 * que suba con la cerradura puesta del lado de fuera.
 *
 * @returns {{ problemas: string[], avisos: string[] }}
 */
function revisar() {
  const problemas = [];
  const avisos = [];
  // Lo que corta el arranque en cualquier entorno, no solo en produccion.
  const graves = [];

  Object.keys(PUBLICOS).forEach((ruta) => {
    const valor = String(leer(ruta) ?? '');
    const etiqueta = ETIQUETAS[ruta];

    if (PUBLICOS[ruta].includes(valor)) {
      problemas.push(`${etiqueta} sigue siendo el valor por defecto del repositorio`);
    } else if (valor.length < MINIMOS[ruta]) {
      problemas.push(`${etiqueta} es demasiado corto (minimo ${MINIMOS[ruta]} caracteres)`);
    }
  });

  // Un comodin en CORS junto a credenciales deja que cualquier web lea la API
  // con la sesion del usuario.
  if (env.corsOrigin.includes('*')) {
    problemas.push('CORS_ORIGIN no puede ser * : hay que listar los dominios permitidos');
  }
  if (env.corsOrigin.some((o) => o.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(o))) {
    problemas.push('CORS_ORIGIN tiene un dominio en http:// (sin cifrar); usa https://');
  }

  // Reconstruir indices puede tardar y bloquea escrituras mientras corre: en
  // produccion se hace a proposito y a una hora elegida, no en cada arranque.
  if (env.dbSyncIndexes) {
    avisos.push('DB_SYNC_INDEXES=true reconstruye indices en cada arranque');
  }

  /*
   * La conexion a Mongo.
   *
   * mongodb+srv:// (Atlas) ya cifra de serie. Lo que hay que impedir es
   * apuntar a una base local en produccion, y sobre todo un mongodb:// sin
   * cifrar fuera de la maquina: ahi el usuario, la contrasena y los datos de
   * los alumnos cruzarian la red en claro.
   */
  const uri = String(env.db.uri || '');
  const esLocal = /\/\/(localhost|127\.0\.0\.1|mongo)[:/]/.test(uri);
  const cifrada = uri.startsWith('mongodb+srv://') || /[?&]tls=true|[?&]ssl=true/.test(uri);

  // Se mira la variable y no env.db.uri: esta ultima trae el valor por
  // defecto de desarrollo, asi que "no la puse" se leeria como "apunta a
  // localhost", y el mensaje mandaria a corregir lo que no es.
  if (!process.env.MONGODB_URI) {
    problemas.push('MONGODB_URI no esta configurado');
  } else if (esLocal) {
    problemas.push('MONGODB_URI apunta a una base local; en produccion debe ser la de verdad');
  } else if (!cifrada) {
    problemas.push('MONGODB_URI sin cifrar: usa mongodb+srv:// o anade tls=true');
  }
  // Una URI de Atlas lleva la contrasena dentro, asi que si se quedo la de
  // ejemplo hay que decirlo igual que con los demas secretos.
  if (/(<password>|usuario:clave|user:pass)@/i.test(uri)) {
    problemas.push('MONGODB_URI todavia tiene el usuario y la clave de ejemplo');
  }

  /*
   * La cuenta del dia a dia. Si esta definida, su clave aguanta lo mismo que
   * la del administrador: es una puerta de entrada igual de real, y desde
   * ella se ven los datos de los alumnos.
   */
  if (env.usuario.email || env.usuario.password) {
    if (!env.usuario.email || !env.usuario.password) {
      problemas.push('USUARIO_EMAIL y USUARIO_PASSWORD van juntos: falta uno de los dos');
    } else if (String(env.usuario.password).length < 12) {
      problemas.push('USUARIO_PASSWORD es demasiado corta (minimo 12 caracteres)');
    } else if (env.usuario.password === env.admin.password) {
      problemas.push('USUARIO_PASSWORD no puede ser la misma que la del administrador');
    }
    if (env.usuario.email && env.usuario.email === env.admin.email) {
      problemas.push('USUARIO_EMAIL no puede ser el mismo correo que el del administrador');
    }
  }

  /*
   * La cuenta de demostracion y la base real no pueden convivir.
   *
   * Es una cuenta PUBLICA: su correo y su clave se reparten a quien quiera
   * mirar. Si existe contra la base de la academia, los nombres de los
   * alumnos, sus mensualidades y los retiros del dueno quedan al alcance de
   * cualquiera. La demo va en su propio despliegue, contra su propia base,
   * con datos inventados.
   *
   * La regla es el nombre de la base: tiene que decir que es la de demo. Es
   * tosco a proposito, porque la alternativa es confiar en que nadie se
   * equivoque de variable el dia del despliegue.
   */
  if (env.demo.email && env.demo.password) {
    const nombre = String(env.db.name || '').toLowerCase();
    if (!nombre.includes('demo')) {
      /*
       * Esto va en `graves` y no en `problemas`: corta el arranque en
       * CUALQUIER entorno, no solo en produccion.
       *
       * El resto de la revision mira cosas que estan mal de cara a desplegar
       * (un secreto por defecto, un CORS abierto) y que en el portatil no
       * hacen dano. Esta no: la base local tiene los mismos 30 alumnos
       * reales, asi que crear aqui la cuenta publica los expone igual.
       */
      graves.push(
        `Hay cuenta de demostracion pero DB_NAME es "${env.db.name}": la demo necesita su propia base (algo con "demo" en el nombre)`
      );
    }
    if (env.demo.email === env.admin.email || env.demo.email === env.usuario.email) {
      graves.push('DEMO_EMAIL no puede repetir el correo de otra cuenta');
    }
  }

  /*
   * La zona horaria tiene que existir. Una mal escrita no falla al arrancar:
   * revienta con un RangeError en la primera fecha que se calcule, que sera
   * al registrar un cobro, y con un mensaje que no apunta a la causa.
   */
  try {
    new Date().toLocaleDateString('en-CA', { timeZone: env.timezone });
  } catch (error) {
    graves.push(`ACADEMY_TZ no es una zona horaria valida: "${env.timezone}"`);
  }

  if (env.docsEnabled) {
    avisos.push('API_DOCS_ENABLED=true publica Swagger y toda la superficie del API');
  }
  if (env.seedOnStart) {
    avisos.push('SEED_ON_START=true cargaria data.json si la base apareciera vacia');
  }

  return { problemas, avisos, graves };
}

/**
 * Aplica la revision. En produccion corta el arranque; fuera de produccion
 * imprime la lista para que no se llegue al despliegue con sorpresas.
 */
function assertProductionConfig({ exit = true } = {}) {
  const { problemas, avisos, graves } = revisar();
  const produccion = env.nodeEnv === 'production';

  avisos.forEach((a) => console.warn(`[config] Aviso: ${a}`));

  // Lo grave no espera a produccion: exponer datos de alumnos es igual de
  // serio en el portatil que en el servidor.
  if (graves.length) {
    graves.forEach((g) => console.error(`[config] BLOQUEANTE: ${g}`));
    console.error('[config] El servidor no arranca asi, ni en desarrollo.');
    if (exit) process.exit(1);
    return false;
  }

  if (!problemas.length) {
    if (produccion) console.log('[config] Revision de seguridad superada');
    return true;
  }

  const prefijo = produccion ? '[config] BLOQUEANTE' : '[config] Pendiente para produccion';
  problemas.forEach((p) => console.error(`${prefijo}: ${p}`));

  if (!produccion) {
    console.warn(
      `[config] ${problemas.length} problema(s) que impedirian arrancar con NODE_ENV=production`
    );
    return false;
  }

  console.error('[config] El servidor no arranca con esta configuracion. Corrige el entorno.');
  if (exit) process.exit(1);
  return false;
}

module.exports = { assertProductionConfig, revisar };
