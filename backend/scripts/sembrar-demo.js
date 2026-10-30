/* eslint-disable no-console */
/**
 * Llena la base de DEMOSTRACION con datos inventados.
 *
 *   npm run demo:sembrar
 *
 * Los nombres, los montos y las referencias son ficticios. Ninguno sale de la
 * academia real: la demo es publica y entra cualquiera, asi que no puede
 * contener el nombre de un alumno de verdad.
 *
 * Se niega a correr si la base no se llama de demo. Es la misma regla que
 * impide arrancar con la cuenta publica contra la base real, y por el mismo
 * motivo: el dia del despliegue lo facil es equivocarse de variable.
 */
const env = require('../src/config/env');
const { connectWithRetry, mongoose } = require('../src/config/database');
const { esSesionDemo, enSesion } = require('../src/config/contexto');
const models = require('../src/models');
const { syncCounter, Counter, claveDe } = require('../src/models/plugins/autoIncrement');
const { TABLES } = require('../src/seed/dataset');
const { round2 } = require('../src/utils/money');

const NOMBRES = [
  ['Valentina', 'Rojas'], ['Mateo', 'Figueroa'], ['Camila', 'Betancourt'],
  ['Santiago', 'Peralta'], ['Isabella', 'Quintero'], ['Emiliano', 'Vargas'],
  ['Antonella', 'Salazar'], ['Thiago', 'Mendoza'], ['Renata', 'Carrillo'],
  ['Dante', 'Aguilar'], ['Julieta', 'Navarro'], ['Bruno', 'Castillo'],
  ['Martina', 'Ortega'], ['Lucas', 'Herrera'], ['Alma', 'Pineda'],
  ['Joaquin', 'Serrano'], ['Olivia', 'Fuentes'], ['Benjamin', 'Lara'],
];

const GRADOS = ['1er grado', '2do grado', '3er grado', '4to grado', '5to grado', '6to grado'];

const PRODUCTOS = [
  ['Copia en blanco y negro', 'papeleria', 30, 60, 900],
  ['Copia a color', 'papeleria', 120, 260, 400],
  ['Resma de hojas', 'papeleria', 2800, 4200, 25],
  ['Cuaderno cuadriculado', 'cuaderno', 450, 820, 60],
  ['Juego de colores', 'arte', 900, 1600, 35],
  ['Carpeta plastica', 'papeleria', 260, 480, 48],
  ['Lapiz grafito', 'papeleria', 45, 95, 200],
  ['Anillado', 'papeleria', 300, 700, 80],
];

/** Numero entero entre a y b, los dos incluidos. */
const entre = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const dia = (anio, mes, d) => `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Esta orden solo puede correr dentro de una sesion de visita.
 *
 * Es lo que la hace segura: dentro de esa sesion, TODAS las consultas de los
 * modelos llevan el filtro `demo: true` puesto por el plugin. Un
 * `deleteMany({})` de aqui no puede alcanzar un alumno de la academia aunque
 * se escriba sin cuidado, porque el filtro no lo pone este fichero.
 *
 * Fuera de la sesion si podria, asi que no se deja.
 */
function exigirSesionDeVisita() {
  if (esSesionDemo()) return;
  console.error('');
  console.error('  Esto borra registros y solo puede correr como sesion de visita.');
  console.error('  Fuera de ella alcanzaria los datos de la academia.');
  console.error('');
  console.error('  Lanzalo asi, que ya la abre:');
  console.error('    npm run atlas:demo');
  console.error('');
  process.exit(1);
}

/**
 * Deja el cajon de pruebas en blanco: ni un alumno, ni un cobro, ni una venta.
 *
 * Es el estado en el que debe arrancar. Quien entra a mirar no ve nada y va
 * creando lo suyo, que es lo que hace entendible la aplicacion en dos
 * minutos. Tambien sirve para barrer lo que hayan dejado otros visitantes.
 *
 * Las CUENTAS no se tocan: borrar la de visita la dejaria sin puerta.
 */
async function vaciar() {
  exigirSesionDeVisita();

  // Si ya hay conexion abierta (nos llamo preparar-atlas), se reutiliza.
  if (mongoose.connection.readyState !== 1) await connectWithRetry(5, 1000);
  console.log('\n  Borrando lo que haya creado la visita...\n');

  let borrados = 0;
  for (const t of [...TABLES].reverse()) {
    const { deletedCount } = await models[t].deleteMany({});
    borrados += deletedCount || 0;
  }

  /*
   * Y sus contadores, que son documentos aparte de los de la academia: la
   * visita numera desde un millon para no gastar la numeracion de los
   * recibos reales ni chocar con sus ids.
   */
  await Counter.deleteMany({
    _id: { $in: TABLES.map((t) => claveDe(models[t].collection.name, true)) },
  });

  console.log(`  ${borrados} registros fuera. Los de la academia, intactos.\n`);
}

async function sembrar() {
  await vaciar();
  console.log('  Sembrando datos inventados...\n');

  const { Student, Teacher, Employee, Product, Payment, TeacherPayment,
    EmployeePayment, RentPayment, PersonalPayment, Sale, SaleItem } = models;

  /* ---- Personas ---- */
  const alumnos = await Student.create(
    NOMBRES.map(([firstName, lastName]) => ({
      firstName, lastName, grade: alAzar(GRADOS),
      monthlyFee: alAzar([60, 70, 70, 70, 85]),
      status: 'activo',
    }))
  );

  const profesores = await Teacher.create([
    { firstName: 'Mariela', lastName: 'Acosta', specialty: 'Matematicas', contractType: 'por_alumno', studentsCount: 10, studentRate: 5, weeklyHours: 15 },
    { firstName: 'Ruben', lastName: 'Delgado', specialty: 'Lenguaje', contractType: 'por_alumno', studentsCount: 8, studentRate: 5, weeklyHours: 12 },
  ]);
  const personal = await Employee.create([
    { firstName: 'Noelia', lastName: 'Prado', position: 'Atencion en libreria', payType: 'mensual', payAmount: 180, weeklyHours: 20 },
  ]);

  const productos = await Product.create(
    PRODUCTOS.map(([name, category, cost, price, stock]) => ({ name, category, cost, price, stock, minStock: 10 }))
  );

  /* ---- Dos meses de cobranza ---- */
  const MESES = [[2026, 9], [2026, 10]];
  const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  let cobros = 0;
  for (const [anio, mes] of MESES) {
    for (const alumno of alumnos) {
      // El mes viejo casi todo cobrado; el nuevo, a medias. Asi la demo
      // ensena las tres situaciones: al dia, debiendo y a medias.
      const viejo = mes === 9;
      const total = round2(alumno.monthlyFee);
      const suerte = Math.random();
      const pagado = viejo
        ? (suerte < 0.8 ? total : suerte < 0.9 ? round2(total / 2) : 0)
        : (suerte < 0.35 ? total : suerte < 0.5 ? round2(total / 2) : 0);

      await Payment.create({
        studentId: alumno.id,
        concept: `Mensualidad ${NOMBRE_MES[mes]} ${anio} - ${alumno.getFullName()}`,
        conceptType: 'mensualidad',
        amount: total,
        paidAmount: pagado,
        periodMonth: mes,
        periodYear: anio,
        dueDate: dia(anio, mes, 5),
        paymentDate: pagado > 0 ? dia(anio, mes, entre(1, 20)) : null,
        method: alAzar(['efectivo', 'pago_movil', 'transferencia']),
        reference: Math.random() < 0.5 ? String(entre(10000000, 99999999)) : null,
      });
      cobros += 1;
    }
  }

  /* ---- Nomina, alquiler y retiros ---- */
  for (const [anio, mes] of MESES) {
    for (const profe of profesores) {
      await TeacherPayment.create({
        teacherId: profe.id,
        concept: `Nomina ${NOMBRE_MES[mes]} ${anio}`,
        conceptType: 'salario', weeks: 4, weeklyRate: profe.weeklySalary,
        paidAmount: mes === 9 ? round2(4 * profe.weeklySalary) : 0,
        periodMonth: mes, periodYear: anio, dueDate: dia(anio, mes, 28),
      });
    }
    await EmployeePayment.create({
      employeeId: personal[0].id,
      concept: `Nomina libreria ${NOMBRE_MES[mes]} ${anio}`,
      conceptType: 'salario', weeks: 4, weeklyRate: personal[0].weeklySalary,
      paidAmount: mes === 9 ? round2(4 * personal[0].weeklySalary) : 0,
      periodMonth: mes, periodYear: anio, dueDate: dia(anio, mes, 28),
    });
    await RentPayment.create({
      concept: `Alquiler ${NOMBRE_MES[mes]} ${anio}`,
      landlord: 'Inversiones La Esquina', amount: 250, currency: 'USD',
      paidAmount: mes === 9 ? 250 : 0,
      periodMonth: mes, periodYear: anio, dueDate: dia(anio, mes, 5),
    });
    for (const [concepto, monto] of [['Gastos del mes', 180], ['Retiro personal', 120]]) {
      await PersonalPayment.create({
        concept: concepto, category: 'retiro', amount: monto, currency: 'USD',
        paymentDate: dia(anio, mes, entre(5, 25)), method: 'efectivo',
      });
    }
  }

  /* ---- Ventas de libreria ---- */
  let ventas = 0;
  for (const [anio, mes] of MESES) {
    for (let i = 0; i < 9; i += 1) {
      const lineas = [];
      let subtotal = 0;
      let costo = 0;

      for (let j = 0; j < entre(1, 3); j += 1) {
        const prod = alAzar(productos);
        const cantidad = entre(1, 20);
        lineas.push({
          productId: prod.id, name: prod.name, quantity: cantidad,
          unitPrice: prod.price, unitCost: prod.cost,
          subtotal: round2(prod.price * cantidad),
        });
        subtotal = round2(subtotal + prod.price * cantidad);
        costo = round2(costo + prod.cost * cantidad);
      }

      const venta = await Sale.create({
        studentId: Math.random() < 0.5 ? alAzar(alumnos).id : null,
        buyerName: Math.random() < 0.5 ? null : 'Publico general',
        saleDate: dia(anio, mes, entre(1, 26)),
        subtotal, cost: costo, paidAmount: subtotal,
        method: alAzar(['efectivo', 'pago_movil']),
      });
      await SaleItem.create(lineas.map((l) => ({ ...l, saleId: venta.id })));
      ventas += 1;
    }
  }

  // Los contadores por encima del id mas alto, o el proximo alta chocaria.
  for (const t of TABLES) {
    const ultimo = await models[t].findOne().sort({ id: -1 }).select('id').lean();
    await syncCounter(models[t].collection.name, ultimo ? ultimo.id : 0);
  }

  console.log(`  ${alumnos.length} alumnos, ${profesores.length} profesores, ${personal.length} en libreria`);
  console.log(`  ${productos.length} productos, ${cobros} cobros, ${ventas} ventas`);
  console.log(`  nomina, alquiler y retiros de ${MESES.length} meses`);
  console.log('\n  Listo. Todos los nombres y montos son inventados.\n');

}

/*
 * Al ejecutarlo directamente abre y cierra la conexion el mismo. Cuando lo
 * llama preparar-atlas, la conexion ya esta abierta y la cierra quien la
 * abrio: por eso la siembra no desconecta por su cuenta.
 */
if (require.main === module) {
  // Abre la sesion de visita: sin ella, sembrar se niega a correr.
  enSesion(true, () => sembrar())
    .then(() => mongoose.disconnect())
    .catch((error) => {
      console.error('[demo] Error:', error.message);
      process.exit(1);
    });
}

module.exports = { sembrar, vaciar };
