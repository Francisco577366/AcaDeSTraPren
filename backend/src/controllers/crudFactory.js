const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getPagination, buildPage } = require('../utils/pagination');
const { updateRecord } = require('../utils/persist');
const { aplicarCascada } = require('../utils/cascade');

/** Escapa lo que el usuario escribio para que no se lea como expresion regular. */
const escaparRegex = (texto) => String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Construye los cinco handlers CRUD estandar para un modelo de Mongoose.
 *
 * @param {object} cfg
 * @param {import('mongoose').Model} cfg.model     Modelo de Mongoose.
 * @param {string}   cfg.name                      Nombre legible para los mensajes de error.
 * @param {string[]} [cfg.searchFields]            Campos incluidos en la busqueda por texto.
 * @param {string[]} [cfg.filterFields]            Campos filtrables por igualdad via query string.
 * @param {string}   [cfg.dateField]               Campo usado por los filtros from/to.
 * @param {object[]} [cfg.populate]                Datos de otras colecciones a adjuntar.
 * @param {object}   [cfg.order]                   Orden por defecto.
 * @param {Function} [cfg.serialize]               Transforma el documento antes de responder; recibe (fila, req) para poder recortar segun el rol.
 * @param {Function} [cfg.beforeWrite]             Ajusta el body antes de crear/actualizar.
 * @param {string}   [cfg.cascade]                 Nombre del modelo para el borrado en cascada.
 */
function createCrudController(cfg) {
  const {
    model,
    name,
    searchFields = [],
    filterFields = [],
    dateField = null,
    populate = [],
    order = { id: -1 },
    serialize = (row) => row,
    beforeWrite = async (body) => body,
    cascade = null,
  } = cfg;

  const esquema = model.schema;

  /** Traduce ?sort=campo:desc al orden de Mongo, validando el campo. */
  function parseSort(sort) {
    if (!sort) return order;
    const [campo, dir = 'asc'] = String(sort).split(':');
    // Solo campos que existan en el esquema: si no, el query string podria
    // pedir ordenar por cualquier cosa.
    if (!esquema.path(campo)) return order;
    return { [campo]: dir.toLowerCase() === 'desc' ? -1 : 1 };
  }

  /**
   * Los filtros llegan como texto en el query string. Hay que convertirlos al
   * tipo del campo o no casarian con nada: Mongo compara tipos, y el texto
   * 'true' no es el booleano true ni el texto '3' es el numero 3.
   */
  function castFilter(campo, valor) {
    const tipo = esquema.path(campo)?.instance;
    if (tipo === 'Boolean') return valor === 'true' || valor === true || valor === '1';
    if (tipo === 'Number') return Number(valor);
    return valor;
  }

  /** Construye el filtro combinando busqueda, filtros exactos y rango de fechas. */
  function buildWhere(query) {
    const where = {};

    if (query.search && searchFields.length) {
      const patron = new RegExp(escaparRegex(query.search), 'i');
      where.$or = searchFields.map((campo) => ({ [campo]: patron }));
    }

    filterFields.forEach((campo) => {
      const valor = query[campo];
      if (valor !== undefined && valor !== '' && valor !== 'all') {
        where[campo] = castFilter(campo, valor);
      }
    });

    if (dateField && (query.from || query.to)) {
      where[dateField] = {};
      // Las fechas son texto aaaa-mm-dd, y en ese formato comparar como texto
      // da el mismo resultado que comparar como fecha.
      if (query.from) where[dateField].$gte = query.from;
      if (query.to) where[dateField].$lte = query.to;
    }

    return where;
  }

  /**
   * Los formularios envian null en los campos que quedaron vacios. Para los
   * obligatorios que tienen valor por defecto (fechas, montos, estados)
   * preferimos ese default antes que fallar con "es obligatorio".
   */
  function dropNullDefaults(body) {
    Object.keys(body).forEach((clave) => {
      const path = esquema.path(clave);
      if (body[clave] === null && path?.isRequired && path.defaultValue !== undefined) {
        delete body[clave];
      }
    });
    return body;
  }

  /** Adjunta los documentos relacionados; en Mongo se hace a mano. */
  async function adjuntar(docs) {
    if (!populate.length || !docs.length) return docs;

    /* eslint-disable global-require */
    const models = require('../models');
    /* eslint-enable global-require */

    for (const rel of populate) {
      const Modelo = models[rel.modelo];
      if (!Modelo) continue;

      const ids = [...new Set(docs.map((d) => d[rel.campo]).filter((v) => v != null))];
      if (!ids.length) continue;

      // Una sola consulta para todos los documentos de la pagina, no una por
      // fila: con 200 cobros en pantalla eso serian 200 viajes a la base.
      const relacionados = await Modelo.find({ id: { $in: ids } })
        .select(rel.campos || '')
        .lean();
      const porId = new Map(relacionados.map((r) => [r.id, r]));

      docs.forEach((d) => {
        const relacionado = porId.get(d[rel.campo]) || null;
        d[rel.como] = relacionado;
        /*
         * El nombre compuesto se arma aqui y no en el frontend: media docena
         * de pantallas lo necesitan, el apellido es opcional, y si cada una lo
         * compone a su manera acaban saliendo espacios de mas en unas y no en
         * otras.
         */
        if (rel.nombreEn && relacionado) {
          d[rel.nombreEn] = `${relacionado.firstName} ${relacionado.lastName || ''}`.trim();
        }
      });
    }
    return docs;
  }

  const list = asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req.query);
    const where = buildWhere(req.query);

    const [rows, count] = await Promise.all([
      model.find(where).sort(parseSort(req.query.sort)).skip(offset).limit(limit),
      model.countDocuments(where),
    ]);

    const payload = buildPage({ rows, count }, { page, limit });
    payload.data = await adjuntar(payload.data.map((r) => serialize(r, req)));
    res.json({ success: true, ...payload });
  });

  const getOne = asyncHandler(async (req, res) => {
    const row = await model.findOne({ id: Number(req.params.id) });
    if (!row) throw ApiError.notFound(`${name} no encontrado`);
    const [dato] = await adjuntar([serialize(row, req)]);
    res.json({ success: true, data: dato });
  });

  const create = asyncHandler(async (req, res) => {
    const body = dropNullDefaults(await beforeWrite({ ...req.body }, req, null));
    delete body.id;
    /*
     * Quien lo registro se sella aqui, en un solo sitio, y no en cada
     * controlador: es lo que sostiene la pantalla de actividad, y si cada
     * seccion tuviera que acordarse de ponerlo, la primera que se olvidara
     * dejaria un hueco en el control sin que nadie lo notara.
     *
     * Del token, nunca del cuerpo de la peticion: si no, cualquiera podria
     * registrar algo a nombre de otro.
     */
    if (esquema.path('registeredById') && req.user) body.registeredById = req.user.id;
    const row = await model.create(body);
    const [dato] = await adjuntar([serialize(row, req)]);
    res.status(201).json({ success: true, data: dato, message: `${name} creado` });
  });

  const update = asyncHandler(async (req, res) => {
    const row = await model.findOne({ id: Number(req.params.id) });
    if (!row) throw ApiError.notFound(`${name} no encontrado`);

    const body = dropNullDefaults(await beforeWrite({ ...req.body }, req, row));
    delete body.id;
    // save() y no findOneAndUpdate: hace falta que corran los hooks que
    // recalculan estados y montos (ver utils/persist.js).
    await updateRecord(row, body);

    const [dato] = await adjuntar([serialize(row, req)]);
    res.json({ success: true, data: dato, message: `${name} actualizado` });
  });

  const remove = asyncHandler(async (req, res) => {
    const row = await model.findOne({ id: Number(req.params.id) });
    if (!row) throw ApiError.notFound(`${name} no encontrado`);

    // Sin claves foraneas, el arrastre lo hace el codigo (ver utils/cascade).
    const arrastre = cascade ? await aplicarCascada(cascade, row.id) : {};
    await row.deleteOne();

    res.json({ success: true, message: `${name} eliminado`, data: { cascade: arrastre } });
  });

  return { list, getOne, create, update, remove, buildWhere, parseSort, adjuntar };
}

module.exports = { createCrudController, escaparRegex };
