const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Si la peticion en curso es de la cuenta de visita.
 *
 * El problema que resuelve: la aplicacion sirve a dos mundos dentro de la
 * MISMA base. La academia de verdad, con sus alumnos y sus cobros, y un cajon
 * de pruebas para quien llega desde LinkedIn a mirar el proyecto.
 *
 * Cada registro lleva una marca `demo`, y cada consulta filtra por ella: una
 * sesion de visita solo ve lo marcado, y todas las demas solo ven lo que no
 * lo esta. El filtro NO se escribe en cada consulta —son cuarenta
 * agregaciones y se olvidaria una— sino que lo pone un plugin de Mongoose en
 * todas a la vez, desde los modelos.
 *
 * Por que AsyncLocalStorage y no pasar el dato de mano en mano: son dieciseis
 * ficheros los que consultan, y entre ellos tres fabricas compartidas
 * (crudFactory, payrollFactory, cascade). Pasarlo por parametro obligaria a
 * tocar cada controlador, cada firma y cada agregacion, que es justo lo que
 * este diseno evita. El almacen lo lleva solo a traves de los await.
 *
 * Quien lo rellena es middlewares/auth.js, a partir del rol que lee de la
 * base. Es el unico sitio por el que pasan todas las rutas con datos.
 *
 * Fuera de una peticion (los scripts, el cron, el arranque) no hay almacen y
 * se trabaja con los datos de la academia. Eso es lo correcto: una tarea
 * programada emite las mensualidades de los alumnos de verdad.
 */
const almacen = new AsyncLocalStorage();

/**
 * Ejecuta `fn` marcado como sesion de visita, o como sesion normal.
 *
 * @param {boolean} demo
 * @param {Function} fn
 */
const enSesion = (demo, fn) => almacen.run({ demo: Boolean(demo) }, fn);

/** Si lo que corre ahora pertenece a la cuenta de visita. */
const esSesionDemo = () => almacen.getStore()?.demo === true;

module.exports = { enSesion, esSesionDemo };
