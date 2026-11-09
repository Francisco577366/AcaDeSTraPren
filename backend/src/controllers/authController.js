const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { esDemo } = require('../config/roles');
const { updateRecord } = require('../utils/persist');
const { limpiarDemo } = require('../services/limpiezaDemo');
const { User } = require('../models');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
    algorithm: env.jwt.algorithm,
  });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!user || !(await user.checkPassword(password))) {
    throw ApiError.unauthorized('Correo o contrasena incorrectos');
  }
  if (!user.active) throw ApiError.forbidden('El usuario esta desactivado');

  /*
   * Cada visita entra a una aplicacion limpia.
   *
   * El barrido tambien lo lanza el cron una vez al dia, pero eso no basta:
   * entre dos ejecuciones pueden pasar veinte visitantes y el segundo se
   * encontraria los alumnos inventados del primero, que es desconcertante y
   * no ensena nada.
   *
   * Va en try/catch a proposito: limpiar es deseable, entrar es obligatorio.
   * Si el barrido falla, que falle solo.
   */
  if (esDemo(user)) {
    try {
      await limpiarDemo();
    } catch (error) {
      console.warn(`[demo] No se pudo barrer el cajon: ${error.message}`);
    }
  }

  await updateRecord(user, { lastLoginAt: new Date() });

  const plain = user.toJSON();
  delete plain.password;

  res.json({ success: true, data: { token: signToken(user), user: plain } });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ name: 1 });
  res.json({ success: true, data: users });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const user = await User.create({ name, email, password, role });
  const plain = user.toJSON();
  delete plain.password;
  res.status(201).json({ success: true, data: plain, message: 'Usuario creado' });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ id: Number(req.params.id) }).select('+password');
  if (!user) throw ApiError.notFound('Usuario no encontrado');

  const { name, email, password, role, active } = req.body;
  const changes = { name, email, role, active };
  if (password) changes.password = password;

  Object.keys(changes).forEach((k) => changes[k] === undefined && delete changes[k]);
  // save() y no un update directo: la contrasena se cifra en el hook de
  // guardado, y un update a la base se lo saltaria dejandola en claro.
  await updateRecord(user, changes);

  const plain = user.toJSON();
  delete plain.password;
  res.json({ success: true, data: plain, message: 'Usuario actualizado' });
});

const deleteUser = asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    throw ApiError.badRequest('No puedes eliminar tu propio usuario');
  }
  const user = await User.findOne({ id: Number(req.params.id) });
  if (!user) throw ApiError.notFound('Usuario no encontrado');
  await user.deleteOne();
  res.json({ success: true, message: 'Usuario eliminado' });
});

const changePassword = asyncHandler(async (req, res) => {
  /*
   * La cuenta de demostracion no cambia su clave. Es publica y compartida:
   * el primer visitante que la cambiara dejaria fuera a todos los demas, y a
   * ti sin demo que ensenar.
   */
  if (esDemo(req.user)) {
    throw ApiError.forbidden('La cuenta de demostracion no puede cambiar su contrasena');
  }

  const { currentPassword, newPassword } = req.body;
  const user = await User.findOne({ id: req.user.id }).select('+password');

  if (!(await user.checkPassword(currentPassword))) {
    throw ApiError.badRequest('La contrasena actual no es correcta');
  }

  await updateRecord(user, { password: newPassword });

  /*
   * Cambiar la contrasena tira todas las sesiones abiertas, que es lo que uno
   * espera si la cambia porque sospecha que alguien la tenia. Pero eso incluye
   * la sesion desde la que se esta cambiando, asi que se devuelve un token
   * nuevo: el que lo hace sigue dentro, los demas se caen.
   */
  res.json({
    success: true,
    message: 'Contrasena actualizada',
    data: { token: signToken(user) },
  });
});

module.exports = { login, me, listUsers, createUser, updateUser, deleteUser, changePassword };
