const { Router } = require('express');

const router = Router();

router.use('/auth', require('./authRoutes'));
router.use('/students', require('./studentRoutes'));
router.use('/teachers', require('./teacherRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/teacher-payments', require('./teacherPaymentRoutes'));
router.use('/works', require('./studentWorkRoutes'));
// Las rutas del personal van antes que las generales de libreria para que
// no pasen por su router sin encontrar nada.
router.use('/library/staff', require('./employeeRoutes'));
router.use('/library/payroll', require('./employeePaymentRoutes'));
router.use('/library', require('./libraryRoutes'));
router.use('/rent', require('./rentRoutes'));
router.use('/personal-payments', require('./personalPaymentRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
// Quien registro que: cada quien la suya, el administrador la de todos.
router.use('/activity', require('./activityRoutes'));
router.use('/settings', require('./settingsRoutes'));
// Tareas programadas desde fuera: no llevan sesion de usuario, llevan su
// propio secreto (ver cronRoutes).
router.use('/cron', require('./cronRoutes'));

module.exports = router;
