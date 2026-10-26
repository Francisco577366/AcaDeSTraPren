const { Router } = require('express');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const env = require('../config/env');
const { ROLES } = require('../config/roles');
const limites = require('../middlewares/rateLimit');
const ctrl = require('../controllers/authController');

const router = Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesion
 *     description: Devuelve un JWT valido para consumir el resto de la API.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Sesion iniciada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/LoginResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/login',
  // La puerta de la fuerza bruta: solo cuentan los intentos fallidos.
  limites.login,
  [
    body('email').isEmail().withMessage('Correo invalido'),
    body('password').notEmpty().withMessage('La contrasena es obligatoria'),
  ],
  validate,
  ctrl.login
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Datos del usuario autenticado
 *     responses:
 *       200:
 *         description: Usuario actual
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', authenticate, ctrl.me);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Cambiar la contrasena propia
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password, minLength: 6 }
 *     responses:
 *       200: { description: Contrasena actualizada }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: env.passwordMinLength })
      .withMessage(`Minimo ${env.passwordMinLength} caracteres`),
  ],
  validate,
  ctrl.changePassword
);

/**
 * @openapi
 * /auth/users:
 *   get:
 *     tags: [Auth]
 *     summary: Listar usuarios del sistema
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *   post:
 *     tags: [Auth]
 *     summary: Crear usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               role: { type: string, enum: [admin, usuario] }
 *     responses:
 *       201: { description: Usuario creado }
 */
router
  .route('/users')
  .get(authenticate, authorize('admin'), ctrl.listUsers)
  .post(
    authenticate,
    authorize('admin'),
    [
      body('name').notEmpty(),
      body('email').isEmail(),
      body('password')
        .isLength({ min: env.passwordMinLength })
        .withMessage(`Minimo ${env.passwordMinLength} caracteres`),
      body('role').optional({ values: 'null' }).isIn(ROLES),
    ],
    validate,
    ctrl.createUser
  );

/**
 * @openapi
 * /auth/users/{id}:
 *   put:
 *     tags: [Auth]
 *     summary: Actualizar usuario
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Usuario actualizado }
 *   delete:
 *     tags: [Auth]
 *     summary: Eliminar usuario
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Usuario eliminado }
 */
router
  .route('/users/:id')
  .put(authenticate, authorize('admin'), ctrl.updateUser)
  .delete(authenticate, authorize('admin'), ctrl.deleteUser);

module.exports = router;
