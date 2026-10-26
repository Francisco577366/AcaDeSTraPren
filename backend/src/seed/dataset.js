const fs = require('fs');
const path = require('path');
const models = require('../models');
const { syncCounter } = require('../models/plugins/autoIncrement');

const DATA_FILE = path.join(__dirname, 'data.json');

/**
 * Colecciones que se guardan en el seed, en orden de dependencia: primero las
 * que no dependen de nadie, luego las que apuntan a ellas. Al restaurar se
 * recorre en este orden y al vaciar, en el inverso.
 *
 * Los usuarios quedan fuera a proposito: las cuentas se crean desde el
 * entorno y no queremos volcar contrasenas, ni siquiera cifradas, a un
 * archivo.
 */
const TABLES = [
  'Student',
  'Teacher',
  'Employee',
  'Product',
  'Payment',
  'TeacherPayment',
  'EmployeePayment',
  'RentPayment',
  'PersonalPayment',
  'StudentWork',
  'Sale',
  'SaleItem',
];

/** Campos internos de Mongo que no tienen por que viajar en el seed. */
const quitarInternos = ({ _id, __v, ...resto }) => resto;

/** Vuelca el contenido actual de la base a src/seed/data.json. */
async function exportData(file = DATA_FILE) {
  const data = { exportedAt: new Date().toISOString(), tables: {} };

  for (const name of TABLES) {
    const rows = await models[name].find().sort({ id: 1 }).lean();
    data.tables[name] = rows.map(quitarInternos);
  }

  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  const counts = Object.fromEntries(
    Object.entries(data.tables).map(([name, rows]) => [name, rows.length])
  );
  return { file, counts };
}

/** True si el archivo de seed existe y tiene al menos un registro. */
function hasDataset(file = DATA_FILE) {
  if (!fs.existsSync(file)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Object.values(data.tables || {}).some((rows) => rows.length > 0);
  } catch (error) {
    return false;
  }
}

/** True si la base no tiene ningun dato de negocio cargado. */
async function isEmpty() {
  const counts = await Promise.all(TABLES.map((name) => models[name].countDocuments()));
  return counts.every((n) => n === 0);
}

/**
 * Restaura el seed.
 *
 * Se usa insertMany y no create(): asi NO corren los hooks de validacion, y
 * los estados y las fechas quedan exactamente como se exportaron. Si corrieran,
 * un recibo que se exporto como "vencido" podria volver como "pendiente"
 * porque hoy es otro dia, y el respaldo dejaria de ser un respaldo.
 *
 * Al terminar se suben los contadores por encima del id mas alto de cada
 * coleccion: sin eso, el primer registro nuevo despues de restaurar
 * intentaria reutilizar el id 1 y chocaria con la clave unica.
 */
async function importData({ file = DATA_FILE, replace = false } = {}) {
  if (!fs.existsSync(file)) {
    throw new Error(`No existe el archivo de seed: ${file}`);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const counts = {};

  if (replace) {
    for (const name of [...TABLES].reverse()) {
      await models[name].deleteMany({});
    }
  }

  for (const name of TABLES) {
    const rows = (data.tables[name] || []).map(quitarInternos);
    if (!rows.length) {
      counts[name] = 0;
      continue;
    }

    // ordered:false sigue adelante con el resto si alguno ya existia, que es
    // lo que hace falta para poder recargar sin borrar antes.
    try {
      await models[name].insertMany(rows, { ordered: false });
    } catch (error) {
      // El codigo 11000 es "clave duplicada": se ignora a proposito.
      if (error.code !== 11000 && !error.writeErrors) throw error;
    }

    const maxId = rows.reduce((a, r) => Math.max(a, Number(r.id) || 0), 0);
    await syncCounter(models[name].collection.name, maxId);

    counts[name] = rows.length;
  }

  return { file, counts };
}

module.exports = { DATA_FILE, TABLES, exportData, importData, hasDataset, isEmpty };
