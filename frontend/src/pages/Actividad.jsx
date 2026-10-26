import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchActivity, fetchAllActivity } from '../store/slices/activitySlice';
import { money, bs, num, date, label } from '../utils/format';
import { StatCard, Loader, EmptyState, DataTable, Badge, Select } from '../components/ui';
import { IconUsers, IconMoney, IconReceipt, IconBook, IconStudent } from '../components/Icons';

const ICONOS = {
  cobros: IconMoney,
  ventas: IconBook,
  alumnos: IconStudent,
  trabajos: IconReceipt,
};

/** Un importe en la moneda que corresponda, o un guion si no mueve dinero. */
const importe = (valor, moneda) => {
  if (moneda === 'VES') return bs(valor);
  if (moneda === 'USD') return money(valor);
  return '-';
};

export default function Actividad() {
  const dispatch = useDispatch();
  const { detalle, todos, loading, error } = useSelector((s) => s.activity);
  const user = useSelector((s) => s.auth.user);
  const { month, year } = useSelector((s) => s.period);
  const esAdmin = user?.role === 'admin';

  // Quien se esta mirando. Vacio = uno mismo.
  const [verA, setVerA] = useState('');

  useEffect(() => {
    dispatch(fetchActivity({ month, year, userId: verA || undefined }));
    if (esAdmin) dispatch(fetchAllActivity({ month, year }));
  }, [dispatch, month, year, verA, esAdmin]);

  if (loading && !detalle) return <Loader text="Cargando actividad..." />;
  if (error && !detalle) return <EmptyState title="No se pudo cargar" hint={error} />;
  if (!detalle) return null;

  const { resumen, totales, movimientos, period } = detalle;

  const opcionesPersonas = (todos?.usuarios || []).map((f) => ({
    value: String(f.user.id),
    label: `${f.user.name} (${label('role', f.user.role)})`,
  }));

  const columnas = [
    {
      key: 'fecha',
      header: 'Fecha',
      render: (r) => (
        <div className="cell-stack">
          <span>{date(r.fecha)}</span>
          <small>{r.receiptNumber || `#${r.id}`}</small>
        </div>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      align: 'center',
      render: (r) => <Badge value={r.etiqueta} tone="info" />,
    },
    {
      key: 'concepto',
      header: 'Concepto',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.concepto}</span>
          {r.method && <small>{label('method', r.method)}</small>}
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Referencia',
      render: (r) =>
        r.reference ? <span className="ref-text">{r.reference}</span> : <span className="muted">-</span>,
    },
    {
      key: 'monto',
      header: 'Monto',
      align: 'right',
      render: (r) => (r.monto === null ? <span className="muted">-</span> : <strong>{importe(r.monto, r.moneda)}</strong>),
    },
  ];

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Actividad</h1>
          <p className="page-sub">
            {detalle.esPropia ? 'Lo que has registrado' : `Lo que registro ${detalle.user.name}`}
            {' en '}{period.label}
          </p>
        </div>
        {/* El selector solo aparece si de verdad hay a quien mirar. */}
        {detalle.puedeVerOtros && opcionesPersonas.length > 1 && (
          <div className="page-actions">
            <Select
              value={verA}
              options={opcionesPersonas}
              placeholder="Mi actividad"
              onChange={(e) => setVerA(e.target.value)}
            />
          </div>
        )}
      </header>

      <div className="card">
        <div className="card-head">
          <h2>{detalle.user.name}</h2>
          <span className="muted">
            {detalle.user.email} - {label('role', detalle.user.role)}
            {detalle.user.lastLoginAt && ` - ultima entrada ${date(detalle.user.lastLoginAt)}`}
          </span>
        </div>

        <div className="stat-grid stat-grid-sm">
          <StatCard
            label="Registros del mes"
            value={num(totales.registros, 0)}
            hint="Todo lo que paso por sus manos"
            tone="info"
            icon={<IconUsers size={20} />}
          />
          <StatCard
            label="Cobrado en dolares"
            value={money(totales.cobradoUSD)}
            tone="success"
            icon={<IconMoney size={20} />}
          />
          <StatCard
            label="Cobrado en bolivares"
            value={bs(totales.cobradoVES)}
            hint="La libreria cobra en Bs"
            tone="success"
            icon={<IconBook size={20} />}
          />
        </div>

        <div className="mini-stats">
          {resumen.map((r) => {
            const Icono = ICONOS[r.clave];
            return (
              <div key={r.clave}>
                <span>
                  {Icono && <Icono size={14} />} {r.etiqueta}
                  <small className="muted"> ({r.count})</small>
                </span>
                <strong>{importe(r.total, r.moneda)}</strong>
              </div>
            );
          })}
        </div>
      </div>

      {/* El cuadro comparativo: es lo que de verdad sirve para controlar,
          porque deja ver a todos a la vez en vez de abrir ficha por ficha. */}
      {esAdmin && todos && (
        <div className="card">
          <div className="card-head">
            <h2>Todas las personas en {todos.period.label}</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="align-center">Registros</th>
                  <th className="align-right">Cobrado USD</th>
                  <th className="align-right">Cobrado Bs</th>
                  <th>Ultima entrada</th>
                  <th className="align-center">Ver</th>
                </tr>
              </thead>
              <tbody>
                {todos.usuarios.map((f) => (
                  <tr key={f.user.id}>
                    <td data-label="Persona">
                      <div className="cell-stack">
                        <strong>{f.user.name}</strong>
                        <small>
                          {label('role', f.user.role)}
                          {!f.user.active && ' - desactivada'}
                        </small>
                      </div>
                    </td>
                    <td data-label="Registros" className="align-center">{num(f.totales.registros, 0)}</td>
                    <td data-label="Cobrado USD" className="align-right">
                      <strong>{money(f.totales.cobradoUSD)}</strong>
                    </td>
                    <td data-label="Cobrado Bs" className="align-right">
                      <strong>{bs(f.totales.cobradoVES)}</strong>
                    </td>
                    <td data-label="Ultima entrada">
                      {f.user.lastLoginAt ? date(f.user.lastLoginAt) : <span className="muted">Nunca</span>}
                    </td>
                    <td data-label="Ver" className="align-center">
                      <button
                        type="button"
                        className="link"
                        onClick={() => setVerA(String(f.user.id))}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lo que no tiene nombre detras no se reparte entre nadie:
              atribuirlo seria inventar, y esta pantalla existe para no hacerlo. */}
          {todos.sinAutor?.length > 0 && (
            <p className="muted footnote">
              Sin autor registrado este mes:{' '}
              {todos.sinAutor.map((s) => `${s.count} ${s.etiqueta.toLowerCase()}`).join(', ')}.
              Son registros anteriores a que se guardara quien los hacia, o creados por el
              sistema (la mensualidad del mes se emite sola).
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Movimientos de {period.label}</h2>
          <span className="muted">Los mas recientes primero</span>
        </div>
        <DataTable
          columns={columnas}
          rows={movimientos}
          rowKey={(r) => `${r.tipo}-${r.id}`}
          empty={
            <EmptyState
              title="Sin movimientos"
              hint={`No hay nada registrado en ${period.label}.`}
            />
          }
        />
      </div>
    </section>
  );
}
