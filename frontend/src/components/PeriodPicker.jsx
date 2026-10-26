import { useDispatch, useSelector } from 'react-redux';
import { setPeriod } from '../store/slices/periodSlice';
import { MONTHS } from '../utils/format';
import { Select } from './ui';

const monthOptions = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

/**
 * El mes con el que se esta trabajando. Vive en la cabecera porque manda
 * sobre todas las secciones: lo que muestra el panel, los cobros que se
 * emiten, la nomina y el alquiler que se generan.
 */
export default function PeriodPicker() {
  const dispatch = useDispatch();
  const { month, year } = useSelector((s) => s.period);
  const real = useSelector((s) => s.options.settings.period);

  // Avisa cuando se esta mirando un mes que no es el actual, para que nadie
  // registre en septiembre creyendo que esta en octubre.
  const esOtroMes = real && (real.month !== month || real.year !== year);

  // Un par de anios alrededor basta: no se registra mas atras que eso.
  const years = [];
  for (let y = (real?.year || year) - 2; y <= (real?.year || year) + 1; y += 1) years.push(y);

  return (
    <div className={`period-picker ${esOtroMes ? 'is-other' : ''}`} title="Mes de trabajo">
      <span className="period-label">Mes</span>
      <Select
        value={month}
        options={monthOptions}
        placeholder={null}
        onChange={(e) => dispatch(setPeriod({ month: e.target.value }))}
      />
      <Select
        value={year}
        options={years.map((y) => ({ value: y, label: String(y) }))}
        placeholder={null}
        onChange={(e) => dispatch(setPeriod({ year: e.target.value }))}
      />
      {esOtroMes && (
        <button
          type="button"
          className="link period-reset"
          onClick={() => dispatch(setPeriod(real))}
        >
          Volver al mes actual
        </button>
      )}
    </div>
  );
}
