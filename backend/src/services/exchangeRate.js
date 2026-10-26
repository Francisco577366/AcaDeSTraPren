const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

/**
 * Tasa oficial del dolar, leida del Banco Central de Venezuela.
 *
 * El BCV sirve un certificado valido de Sectigo pero NO manda el certificado
 * intermedio, asi que la verificacion TLS falla con UNABLE_TO_VERIFY_LEAF_
 * SIGNATURE. En vez de desactivar la verificacion (que abriria la puerta a que
 * cualquiera suplante al banco) se le aporta el intermedio que falta: la
 * cadena se valida de verdad contra la raiz de Sectigo.
 *
 * Si el BCV no responde se recurre a EXCHANGE_RATE_URL, que publica la misma
 * tasa oficial. Y si tampoco esa responde, se devuelve la ultima conocida
 * marcada como vencida: mas vale una tasa de ayer avisando que ninguna.
 */

const INTERMEDIATE = fs.readFileSync(
  path.join(__dirname, 'certs', 'sectigo-dv-r36.pem'),
  'utf8'
);

let cache = null; // { rate, date, source, fetchedAt }
let pending = null;

/** "842,20670000" -> 842.2067 (el punto separa miles, la coma decimales). */
function parseVeAmount(raw) {
  const value = Number(String(raw).trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Tasa ilegible: ${raw}`);
  return Math.round(value * 10000) / 10000;
}

function get(url, options) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Respondio ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve(body));
    });

    request.setTimeout(env.exchangeRateTimeoutMs, () => {
      request.destroy(new Error('La fuente tardo demasiado'));
    });
    request.on('error', reject);
  });
}

/** Lee la portada del BCV, donde publica la tasa y su fecha valor. */
async function fromBcv() {
  const html = await get('https://www.bcv.org.ve/', {
    ca: [...tls.rootCertificates, INTERMEDIATE],
    headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html' },
  });

  const block = html.match(/id="dolar"[\s\S]{0,1200}/);
  if (!block) throw new Error('La portada del BCV no trae el bloque del dolar');

  const amount = block[0].match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  if (!amount) throw new Error('No se encontro el monto en el bloque del dolar');

  // La fecha valor viene en el atributo content, ya en formato ISO.
  const iso = block[0].match(/content="(\d{4}-\d{2}-\d{2})/);

  return {
    rate: parseVeAmount(amount[1]),
    date: iso ? iso[1] : null,
    source: 'BCV (bcv.org.ve)',
  };
}

/** Respaldo: un espejo que publica la misma tasa oficial en JSON. */
async function fromMirror() {
  const body = await get(env.exchangeRateUrl, { headers: { accept: 'application/json' } });
  const payload = JSON.parse(body);
  const value = Number(payload.promedio ?? payload.venta ?? payload.price ?? payload.rate);
  if (!Number.isFinite(value) || value <= 0) throw new Error('La respuesta no trae una tasa valida');

  return {
    rate: Math.round(value * 10000) / 10000,
    date: String(payload.fechaActualizacion || payload.last_update || '').slice(0, 10) || null,
    source: env.exchangeRateUrl,
  };
}

async function download() {
  try {
    return await fromBcv();
  } catch (bcvError) {
    try {
      const mirror = await fromMirror();
      return { ...mirror, note: `El BCV no respondio (${bcvError.message}); se uso el respaldo` };
    } catch (mirrorError) {
      throw new Error(`BCV: ${bcvError.message}. Respaldo: ${mirrorError.message}`);
    }
  }
}

function isFresh() {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < env.exchangeRateTtlMinutes * 60 * 1000;
}

/**
 * Devuelve la tasa lista para usar. `stale` avisa de que no se pudo
 * refrescar; `rate` es null solo si nunca se logro traer ninguna.
 */
async function getRate({ force = false } = {}) {
  if (!force && isFresh()) return { ...cache, stale: false };

  // Si ya hay una consulta en curso nos colgamos de ella en vez de abrir otra.
  if (!pending) {
    pending = download()
      .then((fresh) => {
        cache = { ...fresh, fetchedAt: Date.now() };
        return cache;
      })
      .finally(() => {
        pending = null;
      });
  }

  try {
    return { ...(await pending), stale: false };
  } catch (error) {
    if (cache) return { ...cache, stale: true, error: error.message };
    return { rate: null, date: null, source: null, fetchedAt: null, stale: true, error: error.message };
  }
}

/** La tasa cacheada sin salir a la red; sirve para convertir en los reportes. */
function cachedRate() {
  return cache ? cache.rate : null;
}

module.exports = { getRate, cachedRate };
