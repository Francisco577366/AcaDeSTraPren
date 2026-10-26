const { todayLocal } = require('../../utils/today');
const { round2 } = require('../../utils/money');
const { crearEsquema, dinero, fechaSimple, correlativo, indiceCorrelativo } = require('./base');

/**
 * Esquema compartido por las dos nominas, la docente y la de libreria.
 *
 * Eran dos ficheros identicos salvo el campo de la persona y el metodo de
 * pago por defecto, y el panel ya las suma como si fueran una. Teniendolas
 * aqui, un cambio en la regla del monto o del estado entra en las dos a la
 * vez, que es justo lo que hay que garantizar para que la nomina cuadre.
 *
 * @param {object} cfg
 * @param {string} cfg.coleccion   Nombre de la coleccion.
 * @param {string} cfg.personaId   Campo que apunta a la persona.
 * @param {string} cfg.metodo      Metodo de pago por defecto.
 * @param {Array}  cfg.indices     Indices propios.
 */
function crearEsquemaNomina({ coleccion, personaId, metodo, indices = [] }) {
  const schema = crearEsquema(
    {
      receiptNumber: correlativo(),
      [personaId]: { type: Number, required: true },
      concept: { type: String, required: true, maxlength: 180 },
      conceptType: {
        type: String,
        required: true,
        default: 'salario',
        enum: ['salario', 'honorarios', 'horas_extra', 'bono', 'reembolso', 'otro'],
      },

      /* --- Base del calculo: semanas trabajadas por el pago semanal --- */
      // Semanas que cubre el recibo; un mes completo son 4
      weeks: dinero(),
      // Pago semanal de la persona en el momento de emitir el recibo
      weeklyRate: dinero(),

      /* --- Alternativa para los pagos por hora --- */
      hours: dinero(),
      rate: dinero(),

      amount: dinero(),
      deductions: dinero(),
      bonus: dinero(),
      paidAmount: dinero(),

      periodMonth: { type: Number, default: null, min: 1, max: 12 },
      periodYear: { type: Number, default: null, min: 2000, max: 2100 },
      dueDate: fechaSimple(),
      paymentDate: fechaSimple(),
      method: {
        type: String,
        required: true,
        default: metodo,
        enum: ['efectivo', 'transferencia', 'pago_movil', 'tarjeta', 'zelle', 'otro'],
      },
      reference: { type: String, maxlength: 80, default: null },
      status: {
        type: String,
        required: true,
        default: 'pendiente',
        enum: ['pendiente', 'parcial', 'pagado', 'anulado'],
      },
      notes: { type: String, default: null },
      registeredById: { type: Number, default: null },
    },
    {
      coleccion,
      indices: [
        indiceCorrelativo('receiptNumber'),
        { [personaId]: 1 },
        { status: 1 },
        { periodYear: 1, periodMonth: 1 },
        ...indices,
      ],
    }
  );

  schema.pre('validate', function antesDeValidar(next) {
    /*
     * El monto base son las semanas trabajadas por el pago semanal. Para los
     * contratos por hora sigue valiendo horas x tarifa. En ninguno de los dos
     * casos se pisa un monto escrito a mano: si alguien corrige el importe,
     * manda la correccion.
     */
    const montoAMano = this.isModified('amount');
    const cambioSemanas = this.isNew || this.isModified('weeks') || this.isModified('weeklyRate');
    const cambioHoras = this.isNew || this.isModified('hours') || this.isModified('rate');

    if (cambioSemanas && !montoAMano && Number(this.weeks) > 0 && Number(this.weeklyRate) > 0) {
      this.amount = round2(Number(this.weeks) * Number(this.weeklyRate));
    } else if (cambioHoras && !montoAMano && Number(this.hours) > 0 && Number(this.rate) > 0) {
      this.amount = round2(Number(this.hours) * Number(this.rate));
    }

    if (this.status === 'anulado') return next();

    const total = Number(this.amount || 0) + Number(this.bonus || 0) - Number(this.deductions || 0);
    const pagado = Number(this.paidAmount || 0);

    if (pagado <= 0) {
      this.status = 'pendiente';
      return next();
    }

    this.status = pagado + 0.009 < total ? 'parcial' : 'pagado';

    // Un abono parcial tambien mueve caja: sin fecha ese dinero no aparece en
    // los reportes por fecha (ver Payment.js).
    if (!this.paymentDate) {
      this.paymentDate = todayLocal();
    }
    return next();
  });

  schema.methods.getTotal = function getTotal() {
    return Number(this.amount || 0) + Number(this.bonus || 0) - Number(this.deductions || 0);
  };

  schema.methods.getBalance = function getBalance() {
    return Math.max(0, this.getTotal() - Number(this.paidAmount || 0));
  };

  /** La misma formula del neto, para usarla dentro de las agregaciones. */
  schema.statics.TOTAL = {
    $subtract: [{ $add: ['$amount', '$bonus'] }, '$deductions'],
  };
  schema.statics.SALDO = {
    $subtract: [{ $add: ['$amount', '$bonus'] }, { $add: ['$deductions', '$paidAmount'] }],
  };

  // Los calcula el hook de validacion (ver utils/persist.js).
  schema.statics.derivedFields = ['status', 'paymentDate', 'amount'];

  return schema;
}

module.exports = { crearEsquemaNomina };
