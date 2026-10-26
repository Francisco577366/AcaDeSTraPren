/** Redondea a 2 decimales evitando errores de coma flotante. */
const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/** Suma una lista de valores numericos, vengan como numero o como texto. */
const sum = (values) => round2(values.reduce((acc, v) => acc + Number(v || 0), 0));

module.exports = { round2, sum };
