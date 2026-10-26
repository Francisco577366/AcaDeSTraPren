import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOptions } from '../store/slices/optionsSlice';
import { bs, date } from '../utils/format';
import { IconRefresh } from './Icons';

/**
 * Tasa oficial del dolar segun el BCV.
 *
 * Se muestra donde hace falta tenerla a mano: en la libreria, que cobra en
 * bolivares, y en los pagos, donde las mensualidades estan en dolares pero
 * muchas veces se cobran en bolivares al cambio del dia.
 */
export default function ExchangeRate() {
  const dispatch = useDispatch();
  const { rate, date: rateDate, source, note, stale } = useSelector((s) => s.options.exchangeRate);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await dispatch(fetchOptions());
    setRefreshing(false);
  };

  // Si la tasa no vino del BCV hay que decirlo: el respaldo puede ir atrasado.
  const fromBcv = String(source || '').startsWith('BCV');
  const warn = stale || Boolean(note);

  let detail = 'No se pudo consultar la fuente';
  if (rate) {
    detail = rateDate ? `Fecha valor ${date(rateDate)}` : 'Sin fecha';
    if (stale) detail += ' - no se pudo actualizar';
    else if (!fromBcv) detail += ' - el BCV no respondio, tasa de respaldo';
  }

  return (
    <div className={`rate-bar ${warn ? 'is-stale' : ''}`}>
      <div className="rate-bar-main">
        <span className="rate-bar-label">{fromBcv ? 'Tasa BCV' : 'Tasa oficial'}</span>
        <strong>{rate ? `${bs(rate)} por USD` : 'No disponible'}</strong>
      </div>
      <small className="muted">{detail}</small>
      <button
        type="button"
        className="icon-btn"
        title="Actualizar la tasa"
        onClick={refresh}
        disabled={refreshing}
      >
        <IconRefresh size={15} />
      </button>
    </div>
  );
}
