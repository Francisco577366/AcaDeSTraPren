const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/money');
const { currentPeriod } = require('../utils/today');
const { esAdmin } = require('../config/roles');
const {
  User, Student, Payment, Sale, StudentWork,
  TeacherPayment, EmployeePayment, RentPayment, PersonalPayment,
} = require('../models');

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Que cuenta como actividad de cada tipo.
 *
 * `reservado` marca lo que solo aparece cuando lo mira el administrador. Un
 * usuario normal no puede registrar nomina, alquiler ni retiros (esas rutas
 * las tiene cerradas), asi que en su pantalla eso saldria siempre en cero;
 * pero se deja declarado para que, si manana alguien le abre una de esas
 * puertas, su actividad no empiece a publicar cifras del negocio por aqui.
 */
const FUENTES = [
  {
    clave: 'cobros',
    etiqueta: 'Cobros a alumnos',
    modelo: () => Payment,
    fecha: 'paymentDate',
    importe: '$paidAmount',
    moneda: 'USD',
  },
  {
    clave: 'ventas',
    etiqueta: 'Ventas de libreria',
    modelo: () => Sale,
    fecha: 'saleDate',
    importe: '$paidAmount',
    moneda: 'VES',
  },
  {
    clave: 'alumnos',
    etiqueta: 'Alumnos inscritos',
    modelo: () => Student,
    // El alumno no tiene fecha propia: se usa cuando se creo el registro.
    fecha: 'createdAt',
    fechaEsMarcaDeTiempo: true,
    importe: null,
  },
  {
    clave: 'trabajos',
    etiqueta: 'Trabajos registrados',
    modelo: () => StudentWork,
    fecha: 'assignedDate',
    importe: '$paidAmount',
    moneda: 'USD',
  },
  {
    clave: 'nominaDocente',
    etiqueta: 'Nomina de profesores',
    modelo: () => TeacherPayment,
    fecha: 'paymentDate',
    importe: '$paidAmount',
    moneda: 'USD',
    reservado: true,
  },
  {
    clave: 'nominaLibreria',
    etiqueta: 'Nomina de libreria',
    modelo: () => EmployeePayment,
    fecha: 'paymentDate',
    importe: '$paidAmount',
    moneda: 'USD',
    reservado: true,
  },
  {
    clave: 'alquiler',
    etiqueta: 'Alquiler',
    modelo: () => RentPayment,
    fecha: 'paymentDate',
    importe: '$paidAmount',
    moneda: 'USD',
    reservado: true,
  },
  {
    clave: 'personales',
    etiqueta: 'Retiros personales',
    modelo: () => PersonalPayment,
    fecha: 'paymentDate',
    importe: '$amount',
    moneda: 'USD',
    reservado: true,
  },
];

/** Primer y ultimo dia del mes, como aaaa-mm-dd. */
function rangoDelMes(month, year) {
  const mm = String(month).padStart(2, '0');
  const ultimo = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { desde: `${year}-${mm}-01`, hasta: `${year}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

/** Filtro por periodo segun el campo de fecha sea texto o marca de tiempo. */
function filtroFecha(fuente, { desde, hasta }) {
  if (!fuente.fechaEsMarcaDeTiempo) {
    // Las fechas son texto aaaa-mm-dd: comparar como texto da el mismo
    // resultado que comparar como fecha.
    return { [fuente.fecha]: { $gte: desde, $lte: hasta } };
  }
  return {
    [fuente.fecha]: {
      $gte: new Date(`${desde}T00:00:00.000Z`),
      $lte: new Date(`${hasta}T23:59:59.999Z`),
    },
  };
}

/** Resumen de una fuente para un usuario y un mes: cuantos y cuanto. */
async function resumirFuente(fuente, userId, rango) {
  const Modelo = fuente.modelo();
  const filtro = {
    registeredById: userId,
    ...filtroFecha(fuente, rango),
  };
  // Lo anulado no cuenta como trabajo hecho ni como dinero movido.
  if (Modelo.schema.path('status')) filtro.status = { $ne: 'anulado' };

  const [fila] = await Modelo.aggregate([
    { $match: filtro },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        total: fuente.importe ? { $sum: fuente.importe } : { $sum: 0 },
      },
    },
  ]);

  return {
    clave: fuente.clave,
    etiqueta: fuente.etiqueta,
    count: fila ? fila.count : 0,
    total: fila ? round2(fila.total) : 0,
    moneda: fuente.moneda || null,
  };
}

/** Los ultimos movimientos del usuario en el mes, de todas las fuentes. */
async function movimientosDe(fuentes, userId, rango, limite = 40) {
  const todos = [];

  for (const fuente of fuentes) {
    const Modelo = fuente.modelo();
    const filtro = { registeredById: userId, ...filtroFecha(fuente, rango) };
    if (Modelo.schema.path('status')) filtro.status = { $ne: 'anulado' };

    const filas = await Modelo.find(filtro)
      .sort({ [fuente.fecha]: -1, id: -1 })
      .limit(limite)
      .lean();

    filas.forEach((f) => {
      todos.push({
        tipo: fuente.clave,
        etiqueta: fuente.etiqueta,
        id: f.id,
        receiptNumber: f.receiptNumber || null,
        concepto: f.concept || f.title
          || `${f.firstName || ''} ${f.lastName || ''}`.trim() || '-',
        fecha: fuente.fechaEsMarcaDeTiempo
          ? new Date(f[fuente.fecha]).toISOString().slice(0, 10)
          : f[fuente.fecha],
        monto: fuente.importe ? round2(f[fuente.importe.slice(1)] || 0) : null,
        moneda: fuente.moneda || null,
        reference: f.reference || null,
        method: f.method || null,
      });
    });
  }

  return todos
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id)
    .slice(0, limite);
}

/**
 * Pantalla de actividad de una persona.
 *
 * Cada quien ve la suya. El administrador puede abrir la de cualquiera
 * pasando ?userId=, que es lo que permite llevar el control de quien registro
 * que: sin esto, el dinero entra en caja sin nombre detras.
 */
const mine = asyncHandler(async (req, res) => {
  const pedido = req.query.userId ? Number(req.query.userId) : req.user.id;

  // Mirar la actividad de otro solo lo hace el administrador.
  if (pedido !== req.user.id && !esAdmin(req.user)) {
    throw ApiError.forbidden('Solo puedes ver tu propia actividad');
  }

  const usuario = pedido === req.user.id
    ? req.user
    : await User.findOne({ id: pedido });
  if (!usuario) throw ApiError.notFound('Usuario no encontrado');

  const year = Number(req.query.year) || currentPeriod().year;
  const month = Number(req.query.month) || currentPeriod().month;
  const rango = rangoDelMes(month, year);

  // Las fuentes reservadas solo entran si quien mira es el administrador.
  const fuentes = FUENTES.filter((f) => !f.reservado || esAdmin(req.user));

  const [resumen, movimientos] = await Promise.all([
    Promise.all(fuentes.map((f) => resumirFuente(f, usuario.id, rango))),
    movimientosDe(fuentes, usuario.id, rango),
  ]);

  // Lo cobrado en la moneda base y lo cobrado en bolivares van por separado:
  // sumarlos sin tasa daria una cifra que no significa nada.
  const cobradoUSD = round2(
    resumen.filter((r) => r.moneda === 'USD').reduce((a, r) => a + r.total, 0)
  );
  const cobradoVES = round2(
    resumen.filter((r) => r.moneda === 'VES').reduce((a, r) => a + r.total, 0)
  );

  res.json({
    success: true,
    data: {
      user: {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        role: usuario.role,
        lastLoginAt: usuario.lastLoginAt || null,
      },
      // Para que la pantalla sepa si enseniar el selector de personas.
      esPropia: pedido === req.user.id,
      puedeVerOtros: esAdmin(req.user),
      period: { month, year, label: `${MESES[month - 1]} ${year}` },
      resumen,
      totales: { cobradoUSD, cobradoVES, registros: resumen.reduce((a, r) => a + r.count, 0) },
      movimientos,
    },
  });
});

/**
 * Cuadro de mando del administrador: todas las personas, una al lado de otra.
 *
 * Es la vista que de verdad sirve para controlar, porque deja comparar en vez
 * de obligar a abrir una ficha tras otra.
 */
const everyone = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || currentPeriod().year;
  const month = Number(req.query.month) || currentPeriod().month;
  const rango = rangoDelMes(month, year);

  const usuarios = await User.find().sort({ role: 1, name: 1 }).lean();

  const filas = await Promise.all(usuarios.map(async (u) => {
    const resumen = await Promise.all(FUENTES.map((f) => resumirFuente(f, u.id, rango)));
    return {
      user: {
        id: u.id, name: u.name, email: u.email, role: u.role,
        active: u.active, lastLoginAt: u.lastLoginAt || null,
      },
      resumen,
      totales: {
        cobradoUSD: round2(
          resumen.filter((r) => r.moneda === 'USD').reduce((a, r) => a + r.total, 0)
        ),
        cobradoVES: round2(
          resumen.filter((r) => r.moneda === 'VES').reduce((a, r) => a + r.total, 0)
        ),
        registros: resumen.reduce((a, r) => a + r.count, 0),
      },
    };
  }));

  /*
   * Lo que no tiene nombre detras.
   *
   * Son los registros anteriores a que se guardara quien los hacia, o creados
   * por un proceso automatico (la emision mensual los crea sin usuario). Se
   * muestra aparte y no se reparte entre nadie: atribuirlos a alguien seria
   * inventar, y esta pantalla existe justamente para no inventar.
   */
  const sinAutor = await Promise.all(FUENTES.map(async (f) => {
    const Modelo = f.modelo();
    const filtro = { registeredById: null, ...filtroFecha(f, rango) };
    if (Modelo.schema.path('status')) filtro.status = { $ne: 'anulado' };
    const count = await Modelo.countDocuments(filtro);
    return { clave: f.clave, etiqueta: f.etiqueta, count };
  }));

  res.json({
    success: true,
    data: {
      period: { month, year, label: `${MESES[month - 1]} ${year}` },
      usuarios: filas,
      sinAutor: sinAutor.filter((s) => s.count > 0),
    },
  });
});

module.exports = { mine, everyone, FUENTES };
