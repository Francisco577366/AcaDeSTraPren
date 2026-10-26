const { mongoose, connect, connectWithRetry, ensureDb } = require('../config/database');
const { syncCounter, peekNextId, Counter } = require('./plugins/autoIncrement');

/*
 * En Mongo no hay asociaciones que declarar: cada documento guarda el id
 * numerico de aquello a lo que pertenece (studentId, teacherId, saleId...) y
 * los controladores lo resuelven cuando hace falta.
 *
 * Las relaciones del modelo siguen siendo las mismas:
 *
 *   Student   1-n Payment, StudentWork, Sale
 *   Teacher   1-n TeacherPayment, StudentWork
 *   Employee  1-n EmployeePayment
 *   Sale      1-n SaleItem
 *   Product   1-n SaleItem   (el renglon copia nombre y precio, asi que la
 *                             venta sobrevive a que se borre el producto)
 *   StudentWork 1-n Payment  (un cobro puede originarse en un trabajo)
 *
 * Lo que SI hay que hacer a mano es el borrado en cascada, que antes lo
 * garantizaba la clave foranea de MySQL. Vive en utils/cascade.js, en un solo
 * sitio, para que no se quede a medias en un controlador y deje cobros
 * colgando de un alumno que ya no existe.
 */

const models = {
  User: require('./User'),
  Student: require('./Student'),
  Teacher: require('./Teacher'),
  Payment: require('./Payment'),
  TeacherPayment: require('./TeacherPayment'),
  StudentWork: require('./StudentWork'),
  Employee: require('./Employee'),
  EmployeePayment: require('./EmployeePayment'),
  RentPayment: require('./RentPayment'),
  PersonalPayment: require('./PersonalPayment'),
  Product: require('./Product'),
  Sale: require('./Sale'),
  SaleItem: require('./SaleItem'),
};

module.exports = {
  mongoose,
  connect,
  connectWithRetry,
  ensureDb,
  syncCounter,
  peekNextId,
  Counter,
  ...models,
};
