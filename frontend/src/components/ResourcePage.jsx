import { useEffect, useMemo, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { pushToast } from '../store/slices/uiSlice';
import { fetchOptions } from '../store/slices/optionsSlice';
import { toInputDate, toInputDateTime } from '../utils/format';
import {
  DataTable,
  Pagination,
  Modal,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Textarea,
  ErrorBanner,
  EmptyState,
} from './ui';
import { IconPlus, IconEdit, IconTrash, IconSearch, IconRefresh, IconClose } from './Icons';

/** Valor inicial de un campo segun su tipo. */
function emptyValue(field) {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return '';
  return '';
}

/** Prepara el registro del API para llenar el formulario. */
function toFormValues(fields, row) {
  const values = {};
  fields.forEach((f) => {
    let value = row ? row[f.name] : undefined;
    if (value === null || value === undefined) {
      values[f.name] = emptyValue(f);
      return;
    }
    if (f.type === 'date') value = toInputDate(value);
    if (f.type === 'datetime-local') value = toInputDateTime(value);
    if (f.type === 'checkbox') value = Boolean(value);
    values[f.name] = value;
  });
  return values;
}

/** Limpia el payload antes de enviarlo: numeros reales y vacios como null. */
function toPayload(fields, values) {
  const payload = {};
  fields.forEach((f) => {
    // Los campos calculados son solo de lectura: no viajan al API.
    if (f.type === 'computed') return;

    let value = values[f.name];
    if (f.type === 'number' || f.type === 'preset-number') {
      value = value === '' ? null : Number(value);
    }
    if (typeof value === 'string' && value.trim() === '') value = null;
    payload[f.name] = value;
  });
  return payload;
}

/**
 * Campo numerico con montos predefinidos. Muestra un desplegable con los
 * valores habituales (por ejemplo el precio base) y una opcion "Otro monto"
 * que revela un campo libre.
 */
function PresetNumberField({ value, presets, customLabel, onChange, required }) {
  const matches = (v) => presets.some((p) => Number(p.value) === Number(v));
  const [isCustom, setIsCustom] = useState(!matches(value));

  const handleSelect = (raw) => {
    if (raw === '__custom__') {
      setIsCustom(true);
      return;
    }
    setIsCustom(false);
    onChange(raw);
  };

  return (
    <>
      <Select
        value={isCustom ? '__custom__' : String(value ?? '')}
        placeholder={null}
        options={[
          ...presets.map((p) => ({ value: String(p.value), label: p.label })),
          { value: '__custom__', label: customLabel || 'Otro monto' },
        ]}
        onChange={(e) => handleSelect(e.target.value)}
      />
      {isCustom && (
        <Input
          type="number"
          step="0.01"
          min="0"
          required={required}
          autoFocus
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}

/**
 * Pagina CRUD generica: barra de filtros, tabla, paginacion y formulario
 * en modal. Cada seccion solo aporta sus columnas, filtros y campos.
 */
export default function ResourcePage({
  title,
  subtitle,
  sliceName,
  thunks,
  actions,
  columns,
  filters = [],
  formFields = [],
  createLabel = 'Nuevo',
  entityName = 'registro',
  // El plural solo se deduce bien en los nombres acabados en vocal.
  entityNamePlural,
  rowActions,
  toolbarExtra,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  formSize = 'md',
  beforeSubmit,
  onRowClick,
  headerExtra,
  searchPlaceholder = 'Buscar...',
}) {
  const dispatch = useDispatch();
  const state = useSelector((s) => s[sliceName]);
  const { items, meta, loading, saving, error, filters: activeFilters } = state;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState({});
  const [formError, setFormError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [searchDraft, setSearchDraft] = useState(activeFilters.search || '');
  // Cambia en cada apertura del modal: remonta los campos para que los que
  // guardan estado propio (montos predefinidos) partan del valor cargado.
  const [formKey, setFormKey] = useState(0);

  // `hiddenOnEdit` es para lo que solo tiene sentido al crear, como emitir
  // los primeros cobros de un alumno: al editarlo esos campos no pintan nada.
  const visibleFields = useMemo(
    () => formFields.filter((f) => !f.hidden && !(f.hiddenOnEdit && editing)),
    [formFields, editing]
  );

  useEffect(() => {
    dispatch(thunks.fetchAll());
    // Recargamos cuando cambian pagina o filtros del slice.
  }, [dispatch, thunks, state.page, JSON.stringify(activeFilters)]);

  // Debounce de la busqueda para no disparar una peticion por tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchDraft !== activeFilters.search) {
        dispatch(actions.setFilter({ key: 'search', value: searchDraft }));
      }
    }, 400);
    return () => clearTimeout(id);
  }, [searchDraft, dispatch, actions, activeFilters.search]);

  const openCreate = useCallback(() => {
    setFormKey((k) => k + 1);
    setEditing(null);
    setValues(toFormValues(formFields, null));
    setFormError(null);
    setModalOpen(true);
  }, [formFields]);

  const openEdit = useCallback(
    (row) => {
      setFormKey((k) => k + 1);
      setEditing(row);
      setValues(toFormValues(formFields, row));
      setFormError(null);
      setModalOpen(true);
    },
    [formFields]
  );

  /**
   * Escribe un campo y deja que arrastre a otros: si el campo define
   * `derive`, lo que devuelva se mezcla en el formulario. Sirve para que
   * elegir un profesor traiga su pago semanal sin escribirlo a mano.
   */
  const setValue = (name, value) =>
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      const field = formFields.find((f) => f.name === name);
      return field && field.derive ? { ...next, ...field.derive(value, prev) } : next;
    });

  const submit = async (event) => {
    event.preventDefault();
    setFormError(null);

    // Al editar, lo que solo vale para el alta ni siquiera viaja.
    let payload = toPayload(
      editing ? formFields.filter((f) => !f.hiddenOnEdit) : formFields,
      values
    );
    if (beforeSubmit) {
      const result = beforeSubmit(payload, values, editing);
      if (typeof result === 'string') {
        setFormError(result);
        return;
      }
      payload = result || payload;
    }

    const action = editing
      ? thunks.updateItem({ id: editing.id, ...payload })
      : thunks.createItem(payload);

    const res = await dispatch(action);
    if (res.error) {
      setFormError(res.payload || 'No se pudo guardar');
      return;
    }

    // Copia neutra: el genero del recurso cambia segun la seccion.
    dispatch(pushToast(editing ? 'Cambios guardados' : 'Registro creado'));
    // Los catalogos que alimentan los selects de otras secciones se cargan al
    // entrar, asi que hay que refrescarlos: si no, el alumno, el profesor o el
    // trabajador recien creado no aparece hasta recargar la pagina.
    dispatch(fetchOptions());
    setModalOpen(false);
  };

  const confirmDelete = async () => {
    const res = await dispatch(thunks.deleteItem(toDelete.id));
    if (res.error) {
      dispatch(pushToast({ message: res.payload || 'No se pudo eliminar', type: 'error' }));
    } else {
      dispatch(pushToast('Registro eliminado'));
      dispatch(fetchOptions());
    }
    setToDelete(null);
  };

  const allColumns = useMemo(() => {
    if (!canEdit && !canDelete && !rowActions) return columns;

    return [
      ...columns,
      {
        key: '__actions',
        header: 'Acciones',
        align: 'right',
        width: '1%',
        // Anclada a la derecha: con muchas columnas la tabla se desplaza y
        // las acciones se salian de la vista, que es como no tenerlas.
        className: 'col-actions',
        render: (row) => (
          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
            {rowActions?.(row)}
            {canEdit && (
              <button type="button" className="icon-btn" title="Editar" onClick={() => openEdit(row)}>
                <IconEdit size={16} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                title="Eliminar"
                onClick={() => setToDelete(row)}
              >
                <IconTrash size={16} />
              </button>
            )}
          </div>
        ),
      },
    ];
  }, [columns, canEdit, canDelete, rowActions, openEdit]);

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        <div className="page-actions">
          {toolbarExtra}
          {canCreate && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <IconPlus size={16} /> {createLabel}
            </button>
          )}
        </div>
      </header>

      {headerExtra}

      <div className="card">
        <div className="filters">
          <div className="search-box">
            <IconSearch size={16} />
            <input
              className="search-input"
              placeholder={searchPlaceholder}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              // Escape vacia la busqueda sin tener que borrar a mano.
              onKeyDown={(e) => e.key === 'Escape' && setSearchDraft('')}
            />
            {searchDraft && (
              <button
                type="button"
                className="icon-btn search-clear"
                title="Borrar la busqueda"
                onClick={() => setSearchDraft('')}
              >
                <IconClose size={14} />
              </button>
            )}
          </div>

          {filters.map((f) => (
            <select
              key={f.key}
              className="input filter-select"
              value={activeFilters[f.key] ?? ''}
              onChange={(e) => dispatch(actions.setFilter({ key: f.key, value: e.target.value }))}
            >
              <option value="">{f.label}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}

          <button
            type="button"
            className="btn btn-ghost"
            title="Limpiar filtros"
            onClick={() => {
              setSearchDraft('');
              dispatch(actions.resetFilters());
            }}
          >
            <IconRefresh size={16} /> Limpiar
          </button>
        </div>

        <ErrorBanner message={error} onClose={() => dispatch(actions.clearError())} />

        <DataTable
          columns={allColumns}
          rows={items}
          loading={loading}
          onRowClick={onRowClick}
          empty={
            <EmptyState
              title={`No hay ${entityNamePlural || `${entityName}s`} para mostrar`}
              hint="Ajusta los filtros o crea un registro nuevo."
              action={
                canCreate && (
                  <button type="button" className="btn btn-primary" onClick={openCreate}>
                    <IconPlus size={16} /> {createLabel}
                  </button>
                )
              }
            />
          }
        />

        <Pagination meta={meta} onPage={(p) => dispatch(actions.setPage(p))} />
      </div>

      <Modal
        open={modalOpen}
        size={formSize}
        title={editing ? `Editar ${entityName}` : createLabel}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="resource-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <form id="resource-form" onSubmit={submit} className="form-grid">
          <ErrorBanner message={formError} onClose={() => setFormError(null)} />

          {visibleFields.map((f) => {
            const value = values[f.name] ?? '';
            const common = {
              name: f.name,
              required: f.required,
              disabled: f.disabledOnEdit && Boolean(editing),
            };

            return (
              <Field
                key={`${f.name}-${formKey}`}
                label={f.label}
                required={f.required}
                hint={f.hint}
                span={f.span}
              >
                {f.type === 'computed' ? (
                  <div className="computed-field">{f.compute(values)}</div>
                ) : f.type === 'preset-number' ? (
                  <PresetNumberField
                    value={value}
                    presets={typeof f.presets === 'function' ? f.presets() : f.presets}
                    customLabel={f.customLabel}
                    required={f.required}
                    onChange={(v) => setValue(f.name, v)}
                  />
                ) : f.type === 'select' ? (
                  <Select
                    {...common}
                    value={value}
                    options={typeof f.options === 'function' ? f.options(values) : f.options}
                    placeholder={f.placeholder ?? 'Seleccionar...'}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                ) : f.type === 'textarea' ? (
                  <Textarea
                    {...common}
                    value={value}
                    rows={f.rows || 3}
                    placeholder={f.placeholder}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                ) : f.type === 'checkbox' ? (
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={Boolean(values[f.name])}
                      onChange={(e) => setValue(f.name, e.target.checked)}
                    />
                    <span>{f.checkboxLabel || 'Activo'}</span>
                  </label>
                ) : (
                  <Input
                    {...common}
                    type={f.type || 'text'}
                    value={value}
                    step={f.step || (f.type === 'number' ? '0.01' : undefined)}
                    min={f.min}
                    max={f.max}
                    placeholder={f.placeholder}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                )}
              </Field>
            );
          })}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Eliminar ${entityName}`}
        message="Esta accion no se puede deshacer. Si el registro tiene datos vinculados, el sistema lo impedira."
        confirmText="Eliminar"
        busy={saving}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
