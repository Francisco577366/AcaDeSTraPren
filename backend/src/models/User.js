const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { ROLES, ROL_POR_DEFECTO, normalizarRol } = require('../config/roles');
const { crearEsquema } = require('./plugins/base');

const schema = crearEsquema(
  {
    name: { type: String, required: true, maxlength: 120, trim: true },
    email: {
      type: String,
      required: true,
      maxlength: 160,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Correo invalido'],
    },
    /**
     * select false: la contrasena no sale de la base salvo que se pida
     * expresamente. Es la red de seguridad para que un endpoint nuevo no la
     * devuelva por descuido al serializar el usuario entero.
     */
    password: { type: String, required: true, maxlength: 255, select: false },
    role: {
      type: String,
      required: true,
      default: ROL_POR_DEFECTO,
      enum: ROLES,
      /**
       * Normaliza al escribir: una cuenta antigua de coordinador o secretaria
       * se guarda ya como usuario, en vez de chocar con el enum. Asi la
       * traduccion ocurre sola en cualquier camino que toque el rol.
       */
      set: (v) => normalizarRol(v),
    },
    active: { type: Boolean, required: true, default: true },
    lastLoginAt: { type: Date, default: null },
    /**
     * Cuando se cambio la contrasena por ultima vez. Los tokens firmados
     * antes de esa marca dejan de valer, que es lo que uno espera al cambiar
     * una contrasena: que las sesiones abiertas se caigan.
     */
    passwordChangedAt: { type: Date, default: null },
  },
  /*
   * marcar: false -> las cuentas NO se separan en dos mundos.
   *
   * Al entrar todavia no se sabe quien es quien, asi que el usuario hay que
   * poder encontrarlo venga de donde venga. Y no hace falta: lo que la cuenta
   * de visita puede ver se decide por su rol, y el listado de usuarios es
   * solo del administrador.
   */
  { coleccion: 'users', marcar: false }
);

schema.pre('save', async function antesDeGuardar(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, env.bcryptRounds);
    // Se marca aqui y no en el controlador: asi vale para cualquier camino
    // que toque la contrasena, incluido el alta de usuarios.
    this.passwordChangedAt = new Date();
    return next();
  } catch (error) {
    return next(error);
  }
});

schema.methods.checkPassword = function checkPassword(plano) {
  return bcrypt.compare(plano, this.password);
};

/**
 * Si el token se firmo antes del ultimo cambio de contrasena, no vale.
 *
 * @param {number} issuedAt El iat del token, en segundos.
 */
schema.methods.tokenIsStale = function tokenIsStale(issuedAt) {
  if (!this.passwordChangedAt || !issuedAt) return false;
  // iat viene en segundos, asi que la marca se compara en segundos: si no,
  // los milisegundos del cambio invalidarian el token recien emitido.
  return issuedAt < Math.floor(new Date(this.passwordChangedAt).getTime() / 1000);
};

module.exports = mongoose.model('User', schema);
