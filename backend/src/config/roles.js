/**
 * Los tres roles de la academia.
 *
 *   admin    El dueno. Ve y hace todo.
 *   usuario  Quien atiende el dia a dia: inscribe alumnos, cobra, vende en
 *            la libreria y consulta quien debe.
 *   demo     Una visita. Ve y prueba lo mismo que un usuario, pero su cuenta
 *            es publica y compartida.
 *   libreria Quien atiende el mostrador de la libreria: vende, cobra lo
 *            pendiente y ajusta inventario. No ve nada del resto de la
 *            academia: ni alumnos, ni mensualidades, ni nomina.
 *
 * Entre admin y usuario la diferencia no es "uno puede mas que otro" sino que
 * hay informacion del negocio que no es asunto de quien atiende el mostrador:
 * lo que gana cada profesor, lo que cuesta el local, lo que el dueno retira
 * para su bolsillo y cuanto queda de ganancia.
 *
 * El rol demo ve exactamente lo mismo que un usuario. Lo que lo separa no son
 * los permisos sino DONDE vive: la demo corre contra una base propia, con
 * datos inventados. Esa es la unica garantia de verdad de que una cuenta
 * publica no acabe mostrando los nombres de los alumnos reales. Un rol con
 * menos permisos sobre los mismos datos seguiria siendo una fuga esperando a
 * que alguien se equivoque en un filtro.
 */
const ROLES = ['admin', 'usuario', 'demo', 'libreria'];
const ROL_POR_DEFECTO = 'usuario';

/**
 * Roles que existian antes y a que se traducen ahora. Se usa al migrar y al
 * leer un usuario antiguo: sin esto, una cuenta de coordinador se quedaria
 * con un rol que ya no existe y el enum la rechazaria al guardarla.
 */
const EQUIVALENCIAS = {
  coordinador: 'usuario',
  secretaria: 'usuario',
};

/** Traduce cualquier rol, viejo o nuevo, a uno de los dos actuales. */
function normalizarRol(rol) {
  const valor = String(rol || '').toLowerCase();
  if (ROLES.includes(valor)) return valor;
  return EQUIVALENCIAS[valor] || ROL_POR_DEFECTO;
}

const esAdmin = (user) => normalizarRol(user?.role) === 'admin';

/**
 * La cuenta de demostracion. Su correo y su clave son publicos y la usan
 * muchas personas a la vez, asi que hay cosas que no puede hacer por mas
 * que un usuario normal si pueda: cambiar su propia contrasena, por ejemplo,
 * dejaria fuera a todos los demas visitantes.
 */
const esDemo = (user) => normalizarRol(user?.role) === 'demo';

/** Quien atiende la libreria. Su mundo empieza y acaba en ese modulo. */
/**
 * Quien ve las cifras SIN recortar.
 *
 * El administrador, porque es suyo. Y la cuenta de visita, porque lo que ve
 * son sus propios numeros inventados: ocultarle la ganancia de su libreria o
 * sus gastos no protege nada y deja la demostracion a medias.
 *
 * Esto NO es un permiso: no abre ninguna ruta. Solo dice que, de lo que ya
 * puede ver, no hay nada que taparle.
 */
const veSusCifras = (user) => esAdmin(user) || esDemo(user);

const esLibreria = (user) => normalizarRol(user?.role) === 'libreria';

/**
 * Lo que solo ve el administrador, dicho una vez.
 *
 * Esta en forma de LISTA DE LO PERMITIDO y no de lo prohibido a proposito. Si
 * manana el panel devuelve un dato nuevo, con una lista de prohibidos ese dato
 * se publicaria solo hasta que alguien se acuerde de anadirlo; asi, lo nuevo
 * nace oculto y hay que decidir expresamente que se muestra.
 */

/** Del panel general, lo que puede ver quien no es administrador. */
const PANEL_USUARIO = {
  counts: ['students', 'teachers', 'works'],
  finance: [
    // Cobranza: es su trabajo, y sin esto no puede hacerlo.
    'incomeMonth',
    'billedPeriod',
    'billedPaid',
    'billedCount',
    'debtPeriod',
    'debtorsPeriod',
    'receivables',
    'receivablesCount',
    'overdue',
    'overdueCount',
    'expectedMonthly',
    // Lo que NO esta aqui y por que:
    //   payroll*   los sueldos de sus companeros
    //   rent*      lo que cuesta el local
    //   toPay*     se deduce de los dos anteriores
    //   profit*, net*, generated*, expenses*   la ganancia del negocio
    //   personal*  lo que el dueno retira para su bolsillo
    //   libraryProfit   margen del negocio, no hace falta para vender
  ],
  debt: [
    'total', 'payments', 'paymentsCount', 'overdue', 'overdueCount',
    'library', 'libraryBs', 'libraryCount', 'libraryConverted',
    'works', 'worksCount', 'overdueStudents',
  ],
  works: ['count', 'pending', 'paid', 'billed'],
  library: ['salesCount', 'total', 'paid', 'pending', 'currency'],
};

/**
 * El margen del negocio tampoco es asunto de quien atiende.
 *
 * Son las mismas cifras que el panel ya oculta (la ganancia de la libreria),
 * pero por otra puerta: las estadisticas de ventas y el valor del inventario.
 * Quien vende necesita saber que se vende y a que precio; cuanto se gana con
 * cada cosa es informacion del dueno.
 */
const CAMPOS_MARGEN = ['profit', 'marginPct', 'cost', 'stockValue', 'potentialMargin'];

/** Quita del objeto, y de lo que cuelgue de el, las cifras de margen. */
function recortarMargen(valor, user) {
  if (veSusCifras(user) || !valor) return valor;
  if (Array.isArray(valor)) return valor.map((v) => recortarMargen(v, user));
  if (typeof valor !== 'object') return valor;

  const salida = {};
  Object.keys(valor).forEach((clave) => {
    if (CAMPOS_MARGEN.includes(clave)) return;
    salida[clave] = recortarMargen(valor[clave], user);
  });
  return salida;
}

/**
 * Del panel, lo que ve quien atiende la libreria.
 *
 * Mucho menos que un usuario normal: su trabajo no toca alumnos ni cobranza,
 * asi que la deuda de los alumnos y lo facturado del mes no le dicen nada y
 * no tienen por que llegarle. Se queda con sus ventas y con la tasa del dia,
 * que la necesita porque la libreria cobra en bolivares.
 */
const PANEL_LIBRERIA = {
  debt: ['library', 'libraryBs', 'libraryCount', 'libraryConverted'],
  library: ['salesCount', 'total', 'paid', 'pending', 'profit', 'currency'],
};

/**
 * Campos de sueldo de profesores y personal. Quien atiende necesita la LISTA
 * de profesores para asignar un trabajo, pero no lo que cobra cada uno.
 */
const CAMPOS_SUELDO = [
  'studentRate', 'weeklySalary', 'monthlySalary', 'dailyRate', 'hourlyRate',
  'payAmount', 'payType', 'contractType', 'studentsCount', 'weeklyHours',
];

/** Deja de un objeto solo las claves permitidas. */
function soloPermitido(objeto, permitidas) {
  if (!objeto) return objeto;
  const salida = {};
  permitidas.forEach((clave) => {
    if (clave in objeto) salida[clave] = objeto[clave];
  });
  return salida;
}

/**
 * Recorta la respuesta del panel para quien no es administrador.
 *
 * Bloquear la ruta de pagos personales no basta: el panel publica el total
 * retirado y la ganancia del mes, que es la misma informacion por otra
 * puerta. Lo que se oculta hay que ocultarlo en TODAS las puertas.
 */
function recortarPanel(data, user) {
  if (veSusCifras(user)) return data;

  // Quien atiende la libreria ve aun menos que un usuario normal: solo lo
  // suyo. Va antes del recorte general porque es mas estrecho, no otra cosa.
  if (esLibreria(user)) {
    return {
      period: data.period,
      counts: {},
      finance: {},
      debt: soloPermitido(data.debt, PANEL_LIBRERIA.debt),
      works: {},
      library: soloPermitido(data.library, PANEL_LIBRERIA.library),
      exchangeRate: data.exchangeRate,
    };
  }

  return {
    period: data.period,
    counts: soloPermitido(data.counts, PANEL_USUARIO.counts),
    finance: soloPermitido(data.finance, PANEL_USUARIO.finance),
    debt: soloPermitido(data.debt, PANEL_USUARIO.debt),
    works: soloPermitido(data.works, PANEL_USUARIO.works),
    library: soloPermitido(data.library, PANEL_USUARIO.library),
    exchangeRate: data.exchangeRate,
  };
}

/**
 * Quita los campos de sueldo de un registro de profesor o de personal.
 *
 * Tambien quita el _id de Mongo. Las consultas con .lean() se saltan la
 * transformacion del modelo, asi que sin esto el identificador interno sale
 * por el API en unos sitios si y en otros no.
 */
function recortarSueldo(fila, user) {
  if (!fila) return fila;
  const copia = fila.toJSON ? fila.toJSON() : { ...fila };
  delete copia._id;
  if (veSusCifras(user)) return copia;
  CAMPOS_SUELDO.forEach((campo) => delete copia[campo]);
  return copia;
}

/**
 * Lo mismo para una lista. Existe para que ningun endpoint se quede fuera por
 * olvido: la version de una sola fila se escribio para el listado y el
 * selector se quedo sin filtrar, publicando los sueldos de todos. Teniendo la
 * de lista a mano, la forma corta de hacerlo bien es tambien la obvia.
 */
const recortarSueldos = (filas, user) => (filas || []).map((f) => recortarSueldo(f, user));

module.exports = {
  ROLES,
  ROL_POR_DEFECTO,
  EQUIVALENCIAS,
  normalizarRol,
  esAdmin,
  esDemo,
  esLibreria,
  veSusCifras,
  recortarPanel,
  recortarMargen,
  CAMPOS_MARGEN,
  recortarSueldo,
  recortarSueldos,
  CAMPOS_SUELDO,
  PANEL_USUARIO,
  PANEL_LIBRERIA,
};
