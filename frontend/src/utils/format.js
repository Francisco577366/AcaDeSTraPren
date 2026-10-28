const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD';

const currencyFormatter = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
});

/**
 * Formatea un monto con el simbolo de la moneda configurada.
 *
 * El formato local pega el signo a la moneda ("USD-210,00") y a simple vista
 * se lee como si fuera positivo, justo en las cifras donde mas importa el
 * signo (un resultado del mes en rojo). Por eso el menos va delante de todo.
 */
export const money = (value) => {
  const amount = Number(value || 0);
  return amount < 0
    ? `-${currencyFormatter.format(Math.abs(amount))}`
    : currencyFormatter.format(amount);
};

/** Formatea un numero sin simbolo, con dos decimales. */
export const num = (value, decimals = 2) =>
  Number(value || 0).toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * Formatea un monto en bolivares. La libreria cobra en Bs mientras que las
 * mensualidades y la nomina van en la moneda base, asi que conviven las dos.
 * El simbolo se escribe a mano porque el de la moneda VES sale como "Bs.S".
 */
export const bs = (value) => {
  const amount = Number(value || 0);
  return amount < 0 ? `-Bs ${num(Math.abs(amount))}` : `Bs ${num(amount)}`;
};

/** dd/mm/aaaa a partir de una fecha ISO o Date. */
export const date = (value) => {
  if (!value) return '-';
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** dd/mm/aaaa hh:mm */
export const dateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Convierte a aaaa-mm-dd, el formato que espera un input[type=date]. */
export const toInputDate = (value) => {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

/** Convierte a aaaa-mm-ddThh:mm para input[type=datetime-local]. */
export const toInputDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

/** Etiquetas legibles para los enums que devuelve el API. */
export const LABELS = {
  studentStatus: {
    activo: 'Activo', inactivo: 'Inactivo', egresado: 'Egresado', retirado: 'Retirado',
  },
  teacherStatus: { activo: 'Activo', inactivo: 'Inactivo', suspendido: 'Suspendido' },
  contractType: {
    por_alumno: 'Por alumno', fijo: 'Salario fijo',
    por_hora: 'Por hora', honorarios: 'Honorarios',
  },
  payType: { semanal: 'Por semana', mensual: 'Por mes', por_hora: 'Por hora' },
  personalCategory: {
    retiro: 'Retiro', salud: 'Salud', hogar: 'Hogar',
    transporte: 'Transporte', otro: 'Otro',
  },
  /** Como va el alumno con sus cobros abiertos. */
  paymentState: {
    con_deuda: 'Debe algo',
    al_dia: 'Al dia',
    pendiente: 'Falta por pagar',
    parcial: 'Pago una parte',
    sin_emitir: 'Sin cobro emitido',
  },
  paymentStatus: {
    pendiente: 'Pendiente', parcial: 'Abono parcial', pagado: 'Pagado',
    vencido: 'Vencido', anulado: 'Anulado',
  },
  conceptType: {
    mensualidad: 'Mensualidad', inscripcion: 'Inscripcion', material: 'Material',
    trabajo: 'Trabajo', transporte: 'Transporte', otro: 'Otro',
  },
  teacherConceptType: {
    salario: 'Salario', honorarios: 'Honorarios', horas_extra: 'Horas extra',
    bono: 'Bono', reembolso: 'Reembolso', otro: 'Otro',
  },
  method: {
    efectivo: 'Efectivo', transferencia: 'Transferencia', pago_movil: 'Pago movil',
    tarjeta: 'Tarjeta', zelle: 'Zelle', otro: 'Otro',
  },
  eventType: {
    clase: 'Clase', evaluacion: 'Evaluacion', reunion: 'Reunion', pago: 'Pago',
    entrega: 'Entrega', feriado: 'Feriado', otro: 'Otro',
  },
  eventStatus: { programado: 'Programado', realizado: 'Realizado', cancelado: 'Cancelado' },
  workStatus: {
    pendiente: 'Pendiente', en_proceso: 'En proceso', entregado: 'Entregado',
    aprobado: 'Aprobado', reprobado: 'Reprobado', cancelado: 'Cancelado',
  },
  workPaymentStatus: {
    sin_costo: 'Sin costo', pendiente: 'Por cobrar', parcial: 'Abono parcial', pagado: 'Pagado',
  },
  workCategory: {
    proyecto: 'Proyecto', tarea: 'Tarea', taller: 'Taller', material: 'Material',
    uniforme: 'Uniforme', evaluacion: 'Evaluacion', otro: 'Otro',
  },
  productCategory: {
    libro: 'Libro', cuaderno: 'Cuaderno', papeleria: 'Papeleria',
    arte: 'Arte', uniforme: 'Uniforme', otro: 'Otro',
  },
  saleStatus: {
    pendiente: 'Por cobrar', parcial: 'Abono parcial', pagado: 'Pagada', anulado: 'Anulada',
  },
  gender: { M: 'Masculino', F: 'Femenino', otro: 'Otro' },
  role: { admin: 'Administrador', usuario: 'Usuario', demo: 'Demostracion', libreria: 'Libreria' },
};

/** Color semantico asociado a cada estado, usado por el componente Badge. */
export const STATUS_TONE = {
  activo: 'success', activa: 'success', pagado: 'success', aprobado: 'success',
  entregado: 'info', realizado: 'success',
  pendiente: 'warning', parcial: 'warning', en_proceso: 'warning', programado: 'info',
  vencido: 'danger', anulado: 'muted', cancelado: 'muted', cancelada: 'muted',
  inactivo: 'muted', inactiva: 'muted', suspendido: 'danger', suspendida: 'danger',
  retirado: 'muted', reprobado: 'danger', egresado: 'info', finalizado: 'muted',
  finalizada: 'muted', sin_costo: 'muted',
  al_dia: 'success',
  sin_emitir: 'muted',
  con_deuda: 'warning',
};

export const label = (group, value) => LABELS[group]?.[value] || value || '-';
