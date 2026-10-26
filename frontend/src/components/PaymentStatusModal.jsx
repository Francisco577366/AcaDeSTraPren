import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { studentThunks } from '../store/slices/resourceSlices';
import { pushToast } from '../store/slices/uiSlice';
import { LABELS, money, date, MONTHS } from '../utils/format';
import { Modal, Badge, Loader, Field, Input, Select, ErrorBanner, optionsFrom } from './ui';

const methodOptions = optionsFrom(LABELS.method);
const monthOptions = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

/**
 * Editor del estado de pago de un alumno.
 *
 * Lista sus cobros con un interruptor Pagado/Pendiente por cada uno, para
 * poder confirmar lo que si pagaron y revertir lo que se marco por error.
 * Si todavia no tiene ningun cobro emitido, ofrece emitir la mensualidad.
 */
export default function PaymentStatusModal({ student, onClose, onSaved }) {
  const dispatch = useDispatch();
  const profile = useSelector((s) => s.students.profile);
  const saving = useSelector((s) => s.students.saving);

  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState({});
  const [form, setForm] = useState({ method: 'efectivo', reference: '' });
  // La mensualidad que se emita desde aqui es la del mes de la cabecera.
  const periodo = useSelector((s) => s.period);
  const [charge, setCharge] = useState({ month: periodo.month, year: periodo.year });
  const [error, setError] = useState(null);

  const open = Boolean(student);

  useEffect(() => {
    setCharge({ month: periodo.month, year: periodo.year });
  }, [periodo.month, periodo.year]);

  useEffect(() => {
    if (!student) return;
    setError(null);
    setMarks({});
    setForm({ method: 'efectivo', reference: '' });
    setLoading(true);
    dispatch(studentThunks.fetchProfile(student.id)).finally(() => setLoading(false));
  }, [dispatch, student]);

  // Solo se pueden mover los cobros vivos; los anulados se restauran en Pagos.
  const charges = useMemo(
    () => (profile?.payments || []).filter((p) => p.status !== 'anulado'),
    [profile]
  );

  const isPaid = (p) => (p.id in marks ? marks[p.id] : p.status === 'pagado');
  const toggle = (p) => setMarks((prev) => ({ ...prev, [p.id]: !isPaid(p) }));

  const changed = charges.filter((p) => isPaid(p) !== (p.status === 'pagado'));

  const save = async (e) => {
    e.preventDefault();
    if (!changed.length) {
      onClose();
      return;
    }

    const res = await dispatch(
      studentThunks.setPaymentStatus({
        id: student.id,
        paid: changed.filter(isPaid).map((p) => p.id),
        pending: changed.filter((p) => !isPaid(p)).map((p) => p.id),
        method: form.method,
        reference: form.reference || null,
      })
    );

    if (res.error) {
      setError(res.payload || 'No se pudo guardar el estado');
      return;
    }

    dispatch(pushToast(res.payload.message));
    onSaved?.();
    onClose();
  };

  const emitCharge = async () => {
    setError(null);
    const res = await dispatch(studentThunks.createCharge({ id: student.id, ...charge }));

    if (res.error) {
      setError(res.payload || 'No se pudo emitir la mensualidad');
      return;
    }

    dispatch(pushToast(res.payload.message));
    // Recargamos la ficha para que el cobro recien emitido aparezca en la lista.
    setLoading(true);
    dispatch(studentThunks.fetchProfile(student.id)).finally(() => setLoading(false));
    onSaved?.();
  };

  return (
    <Modal
      open={open}
      size="lg"
      title={`Estado de pago - ${student?.fullName || ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="submit"
            form="payment-status-form"
            className="btn btn-primary"
            disabled={saving || !changed.length}
          >
            {saving
              ? 'Guardando...'
              : changed.length
                ? `Guardar ${changed.length} cambio${changed.length === 1 ? '' : 's'}`
                : 'Sin cambios'}
          </button>
        </>
      }
    >
      {loading || !profile ? (
        <Loader text="Cargando cobros..." />
      ) : (
        <form id="payment-status-form" onSubmit={save} className="statement">
          <ErrorBanner message={error} onClose={() => setError(null)} />

          {charges.length ? (
            <>
              <p className="muted">
                Marca cada cobro segun corresponda. Lo que quede en <strong>Pagado</strong> se salda
                con la fecha de hoy; lo que quede en <strong>Pendiente</strong> vuelve a quedar por
                cobrar.
              </p>

              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th>Periodo</th>
                      <th className="align-right">Total</th>
                      <th className="align-center">Estado actual</th>
                      <th className="align-center">Pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((p) => (
                      <tr key={p.id}>
                        <td data-label="Concepto">
                          <div className="cell-stack">
                            <span>{p.concept}</span>
                            <small>{p.receiptNumber}</small>
                          </div>
                        </td>
                        <td data-label="Periodo">
                          {p.periodMonth ? `${MONTHS[p.periodMonth - 1]} ${p.periodYear}` : date(p.dueDate)}
                        </td>
                        <td data-label="Total" className="align-right">
                          <strong>{money(p.total)}</strong>
                        </td>
                        <td data-label="Estado actual" className="align-center">
                          <Badge value={p.status} group="paymentStatus" />
                        </td>
                        <td data-label="Pagado" className="align-center">
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={isPaid(p)}
                              onChange={() => toggle(p)}
                            />
                            <span>{isPaid(p) ? 'Si' : 'No'}</span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="form-grid">
                <Field label="Metodo de pago" hint="Se aplica a los que marques como pagados">
                  <Select
                    value={form.method}
                    options={methodOptions}
                    placeholder={null}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                  />
                </Field>
                <Field label="Referencia">
                  <Input
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  />
                </Field>
              </div>
            </>
          ) : (
            <p className="muted">
              Este alumno todavia no tiene ningun cobro emitido, por eso aparece como al dia.
            </p>
          )}

          <h3 className="section-title">Emitir mensualidad</h3>
          <p className="muted">
            Crea el cobro de un mes para este alumno
            {Number(student?.monthlyFee) > 0
              ? `, por ${money(student.monthlyFee)}.`
              : '. Ojo: no tiene mensualidad asignada, editalo primero.'}
          </p>
          <div className="form-grid">
            <Field label="Mes">
              <Select
                value={charge.month}
                options={monthOptions}
                placeholder={null}
                onChange={(e) => setCharge({ ...charge, month: Number(e.target.value) })}
              />
            </Field>
            <Field label="Anio">
              <Input
                type="number"
                step="1"
                value={charge.year}
                onChange={(e) => setCharge({ ...charge, year: Number(e.target.value) })}
              />
            </Field>
            <div className="field field-span-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={emitCharge}
                disabled={saving || !(Number(student?.monthlyFee) > 0)}
              >
                Emitir mensualidad de {MONTHS[charge.month - 1]} {charge.year}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
