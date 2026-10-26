import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { productThunks, saleThunks, staffThunks } from '../store/slices/resourceSlices';
import { resourceActions } from '../store';
import { fetchOptions } from '../store/slices/optionsSlice';
import { pushToast } from '../store/slices/uiSlice';
import { LABELS, money, bs, num, date, label, MONTHS } from '../utils/format';
import {
  optionsFrom, Modal, Badge, StatCard, Field, Input, Select, Textarea,
  ErrorBanner, DataTable, Pagination, EmptyState, ConfirmDialog, Loader,
  BarChart, Legend,
} from '../components/ui';
import {
  IconPlus, IconMoney, IconBan, IconEye, IconRefresh, IconSearch, IconTrash, IconClose,
} from '../components/Icons';
import ResourcePage from '../components/ResourcePage';
import ExchangeRate from '../components/ExchangeRate';

const categoryOptions = optionsFrom(LABELS.productCategory);
const saleStatusOptions = optionsFrom(LABELS.saleStatus);
const methodOptions = optionsFrom(LABELS.method);
const payTypeOptions = optionsFrom(LABELS.payType);
const staffStatusOptions = optionsFrom(LABELS.teacherStatus);

/* ================================================================== */
/* Productos                                                           */
/* ================================================================== */

function ProductsTab() {
  const dispatch = useDispatch();
  const inventory = useSelector((s) => s.products.inventory);
  const saving = useSelector((s) => s.products.saving);

  const [stockFor, setStockFor] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: '', reason: '' });
  const [stockError, setStockError] = useState(null);

  const refreshInventory = () => dispatch(productThunks.fetchInventory());

  useEffect(() => {
    refreshInventory();
  }, [dispatch]);

  const openStock = (row) => {
    setStockFor(row);
    setStockForm({ quantity: '', reason: '' });
    setStockError(null);
  };

  const submitStock = async (e) => {
    e.preventDefault();
    const res = await dispatch(
      productThunks.adjustStock({
        id: stockFor.id,
        quantity: Number(stockForm.quantity),
        reason: stockForm.reason,
      })
    );
    if (res.error) {
      setStockError(res.payload || 'No se pudo ajustar el stock');
      return;
    }
    dispatch(pushToast(res.payload.message));
    refreshInventory();
    dispatch(fetchOptions());
    setStockFor(null);
  };

  const columns = [
    {
      key: 'name',
      header: 'Producto',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.name}</strong>
          <small>
            {r.code} - {label('productCategory', r.category)}
          </small>
        </div>
      ),
    },
    { key: 'cost', header: 'Costo', align: 'right', render: (r) => bs(r.cost) },
    { key: 'price', header: 'Precio', align: 'right', render: (r) => bs(r.price) },
    {
      key: 'margin',
      header: 'Margen',
      align: 'right',
      render: (r) => (
        <strong className={r.margin >= 0 ? 'text-success' : 'text-danger'}>{bs(r.margin)}</strong>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'center',
      render: (r) => (
        <div className="cell-stack" style={{ alignItems: 'center' }}>
          <strong className={r.lowStock ? 'text-danger' : ''}>{num(r.stock, 0)}</strong>
          {r.lowStock && <small className="text-danger">Reponer</small>}
        </div>
      ),
    },
    {
      key: 'active',
      header: 'Estado',
      align: 'center',
      render: (r) => <Badge value={r.active ? 'activo' : 'inactivo'} group="studentStatus" />,
    },
  ];

  const formFields = [
    { name: 'name', label: 'Producto', required: true, span: 2 },
    {
      name: 'category',
      label: 'Categoria',
      type: 'select',
      options: categoryOptions,
      defaultValue: 'papeleria',
      placeholder: null,
    },
    {
      name: 'active',
      label: 'Disponible',
      type: 'checkbox',
      checkboxLabel: 'Se puede vender',
      defaultValue: true,
    },
    {
      name: 'cost',
      label: 'Costo',
      type: 'number',
      defaultValue: 0,
      hint: 'Lo que le cuesta a la academia',
    },
    { name: 'price', label: 'Precio de venta', type: 'number', defaultValue: 0 },
    { name: 'stock', label: 'Stock actual', type: 'number', step: '1', defaultValue: 0 },
    {
      name: 'minStock',
      label: 'Stock minimo',
      type: 'number',
      step: '1',
      defaultValue: 0,
      hint: 'Por debajo de este numero se marca como "Reponer"',
    },
    { name: 'description', label: 'Descripcion', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <ResourcePage
        title="Productos"
        subtitle="Lo que tiene la libreria en inventario, con su costo y su precio"
        sliceName="products"
        thunks={productThunks}
        actions={resourceActions.products}
        columns={columns}
        entityName="producto"
        createLabel="Nuevo producto"
        searchPlaceholder="Buscar por nombre, codigo o descripcion..."
        formSize="lg"
        filters={[
          { key: 'category', label: 'Todas las categorias', options: categoryOptions },
          {
            key: 'active',
            label: 'Todos',
            options: [
              { value: 'true', label: 'Disponibles' },
              { value: 'false', label: 'No disponibles' },
            ],
          },
        ]}
        formFields={formFields}
        beforeSubmit={(payload) => ({ ...payload, active: payload.active ?? true })}
        rowActions={(row) => (
          <button
            type="button"
            className="icon-btn"
            title="Ajustar stock"
            onClick={() => openStock(row)}
          >
            <IconRefresh size={16} />
          </button>
        )}
        headerExtra={
          inventory && (
            <div className="stat-grid stat-grid-sm">
              <StatCard label="Productos" value={num(inventory.productsCount, 0)} />
              <StatCard label="Unidades en stock" value={num(inventory.unitsInStock, 0)} />
              <StatCard label="Valor a costo" value={bs(inventory.stockValue)} tone="info" />
              <StatCard label="Valor a venta" value={bs(inventory.retailValue)} tone="success" />
              <StatCard
                label="Por reponer"
                value={num(inventory.lowStockCount, 0)}
                hint={inventory.lowStockCount ? 'Productos bajo el minimo' : 'Todo cubierto'}
                tone={inventory.lowStockCount ? 'danger' : 'default'}
              />
            </div>
          )
        }
      />

      <Modal
        open={Boolean(stockFor)}
        size="sm"
        title="Ajustar stock"
        onClose={() => setStockFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setStockFor(null)}>
              Cancelar
            </button>
            <button type="submit" form="stock-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Aplicar'}
            </button>
          </>
        }
      >
        <form id="stock-form" onSubmit={submitStock} className="form-grid">
          <ErrorBanner message={stockError} onClose={() => setStockError(null)} />
          <p className="muted field-span-2">
            {stockFor?.name} - stock actual <strong>{num(stockFor?.stock, 0)}</strong>
          </p>
          <Field
            label="Cantidad"
            required
            span={2}
            hint="Positiva para una entrada, negativa para una salida o merma"
          >
            <Input
              type="number"
              step="1"
              required
              value={stockForm.quantity}
              placeholder="12"
              onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
            />
          </Field>
          <Field label="Motivo" span={2}>
            <Input
              value={stockForm.reason}
              placeholder="Compra al proveedor"
              onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}

/* ================================================================== */
/* Ventas                                                              */
/* ================================================================== */

const emptySale = {
  studentId: '',
  buyerName: '',
  saleDate: new Date().toISOString().slice(0, 10),
  discount: 0,
  chargedTotal: '',
  paidAmount: '',
  method: 'efectivo',
  reference: '',
  notes: '',
};

function SalesTab() {
  const dispatch = useDispatch();
  const { items, meta, loading, saving, error, filters, page } = useSelector((s) => s.sales);
  const summary = useSelector((s) => s.sales.summary);
  const productCatalog = useSelector((s) => s.options.products);
  const studentOptions = useSelector((s) =>
    s.options.students.map((st) => ({ value: st.id, label: st.fullName }))
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptySale);
  const [lines, setLines] = useState([]);
  const [picker, setPicker] = useState({ productId: '', quantity: 1 });
  const [formError, setFormError] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [settleFor, setSettleFor] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [voidFor, setVoidFor] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [searchDraft, setSearchDraft] = useState(filters.search || '');

  const refresh = () => {
    dispatch(saleThunks.fetchAll());
    dispatch(saleThunks.fetchSalesSummary());
  };

  useEffect(() => {
    dispatch(saleThunks.fetchAll());
  }, [dispatch, page, JSON.stringify(filters)]);

  useEffect(() => {
    dispatch(saleThunks.fetchSalesSummary());
  }, [dispatch]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (searchDraft !== filters.search) {
        dispatch(resourceActions.sales.setFilter({ key: 'search', value: searchDraft }));
      }
    }, 400);
    return () => clearTimeout(id);
  }, [searchDraft, dispatch, filters.search]);

  /* --- Armado de la venta --- */

  const subtotal = useMemo(
    () => lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0),
    [lines]
  );
  const calculado = Math.max(0, subtotal - Number(form.discount || 0));
  // El precio escrito manda: si no se escribe ninguno, vale el calculado.
  const total =
    form.chargedTotal === '' ? calculado : Math.max(0, Number(form.chargedTotal) || 0);
  const ajuste = Math.round((total - calculado) * 100) / 100;

  const addLine = () => {
    const product = productCatalog.find((p) => String(p.id) === String(picker.productId));
    if (!product) return;

    const quantity = Math.max(1, Number(picker.quantity) || 1);
    const already = lines.find((l) => l.productId === product.id);
    const wanted = quantity + (already ? already.quantity : 0);

    if (wanted > Number(product.stock)) {
      setFormError(`Solo quedan ${product.stock} unidades de "${product.name}"`);
      return;
    }

    setFormError(null);
    setLines((prev) =>
      already
        ? prev.map((l) => (l.productId === product.id ? { ...l, quantity: wanted } : l))
        : [
            ...prev,
            {
              productId: product.id,
              name: product.name,
              quantity,
              unitPrice: Number(product.price),
              stock: Number(product.stock),
            },
          ]
    );
    setPicker({ productId: '', quantity: 1 });
  };

  const removeLine = (productId) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const setLinePrice = (productId, unitPrice) =>
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, unitPrice: Number(unitPrice) || 0 } : l))
    );

  const openCreate = () => {
    setForm({ ...emptySale, saleDate: new Date().toISOString().slice(0, 10) });
    setLines([]);
    setPicker({ productId: '', quantity: 1 });
    setFormError(null);
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!lines.length) {
      setFormError('Agrega al menos un producto a la venta');
      return;
    }

    const res = await dispatch(
      saleThunks.createItem({
        studentId: form.studentId || null,
        buyerName: form.buyerName || null,
        saleDate: form.saleDate,
        discount: Number(form.discount || 0),
        chargedTotal: form.chargedTotal === '' ? null : Number(form.chargedTotal),
        paidAmount: form.paidAmount === '' ? total : Number(form.paidAmount),
        method: form.method,
        reference: form.reference || null,
        notes: form.notes || null,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      })
    );

    if (res.error) {
      setFormError(res.payload || 'No se pudo registrar la venta');
      return;
    }

    dispatch(pushToast('Venta registrada'));
    setModalOpen(false);
    refresh();
    dispatch(productThunks.fetchAll());
    dispatch(productThunks.fetchInventory());
    dispatch(fetchOptions());
  };

  /* --- Acciones sobre una venta --- */

  const submitSettle = async (e) => {
    e.preventDefault();
    const res = await dispatch(
      saleThunks.settleSale({ id: settleFor.id, amount: Number(settleAmount) })
    );
    dispatch(
      pushToast(res.error ? { message: res.payload, type: 'error' } : 'Abono registrado')
    );
    if (!res.error) {
      setSettleFor(null);
      dispatch(saleThunks.fetchSalesSummary());
    }
  };

  const submitVoid = async () => {
    const res = await dispatch(
      saleThunks.voidSale({ id: voidFor.id, reason: 'Anulada desde el panel' })
    );
    dispatch(
      pushToast(res.error ? { message: res.payload, type: 'error' } : res.payload.message)
    );
    setVoidFor(null);
    dispatch(saleThunks.fetchSalesSummary());
    dispatch(productThunks.fetchInventory());
    dispatch(fetchOptions());
  };

  const confirmDelete = async () => {
    const res = await dispatch(saleThunks.deleteItem(toDelete.id));
    dispatch(
      pushToast(res.error ? { message: res.payload, type: 'error' } : 'Venta eliminada')
    );
    setToDelete(null);
    refresh();
    dispatch(productThunks.fetchInventory());
    dispatch(fetchOptions());
  };

  const columns = [
    {
      key: 'receiptNumber',
      header: 'Venta',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.receiptNumber || `#${r.id}`}</strong>
          <small>{date(r.saleDate)}</small>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: 'Comprador',
      render: (r) => (
        <div className="cell-stack">
          <span>{r.buyer}</span>
          <small>
            {r.itemsCount} articulo{r.itemsCount === 1 ? '' : 's'}
          </small>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (r) => (
        <div className="cell-stack align-right">
          <strong>{bs(r.total)}</strong>
          {Number(r.discount) > 0 && <small>-{bs(r.discount)} desc.</small>}
          {Number(r.surcharge) > 0 && <small>+{bs(r.surcharge)} recargo</small>}
        </div>
      ),
    },
    { key: 'paidAmount', header: 'Cobrado', align: 'right', render: (r) => bs(r.paidAmount) },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      render: (r) => (
        <strong className={r.balance > 0 ? 'text-warning' : 'text-success'}>{bs(r.balance)}</strong>
      ),
    },
    {
      key: 'profit',
      header: 'Ganancia',
      align: 'right',
      render: (r) => (
        <span className={r.profit >= 0 ? 'text-success' : 'text-danger'}>{bs(r.profit)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      align: 'center',
      render: (r) => <Badge value={r.status} group="saleStatus" />,
    },
    {
      key: '__actions',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="icon-btn" title="Ver detalle" onClick={() => setDetailFor(r)}>
            <IconEye size={16} />
          </button>
          {r.status !== 'anulado' && r.balance > 0 && (
            <button
              type="button"
              className="icon-btn icon-btn-success"
              title="Registrar abono"
              onClick={() => {
                setSettleFor(r);
                setSettleAmount(String(r.balance));
              }}
            >
              <IconMoney size={16} />
            </button>
          )}
          {r.status !== 'anulado' && (
            <button
              type="button"
              className="icon-btn icon-btn-warning"
              title="Anular y devolver el stock"
              onClick={() => setVoidFor(r)}
            >
              <IconBan size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Eliminar"
            onClick={() => setToDelete(r)}
          >
            <IconTrash size={16} />
          </button>
        </div>
      ),
    },
  ];

  const availableProducts = productCatalog
    .filter((p) => Number(p.stock) > 0)
    .map((p) => ({
      value: p.id,
      label: `${p.name} - ${bs(p.price)} (${p.stock} disp.)`,
    }));

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Ventas de la libreria</h1>
          <p className="page-sub">Cada venta descuenta el inventario y deja su ganancia calculada</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <IconPlus size={16} /> Nueva venta
          </button>
        </div>
      </header>

      {summary && (
        <div className="stat-grid stat-grid-sm">
          <StatCard
            label="Vendido este mes"
            value={bs(summary.month.total)}
            hint={`${summary.month.count} venta(s)`}
          />
          <StatCard label="Cobrado este mes" value={bs(summary.month.paid)} tone="success" />
          <StatCard
            label="Por cobrar"
            value={bs(summary.overall.pending)}
            tone={summary.overall.pending > 0 ? 'warning' : 'default'}
          />
          <StatCard label="Ganancia del mes" value={bs(summary.month.profit)} tone="info" />
          <StatCard label="Ganancia acumulada" value={bs(summary.overall.profit)} tone="success" />
        </div>
      )}

      <div className="card">
        <div className="filters">
          <div className="search-box">
            <IconSearch size={16} />
            <input
              className="search-input"
              placeholder="Buscar por numero de venta, comprador o referencia..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
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
          <select
            className="input filter-select"
            value={filters.status}
            onChange={(e) =>
              dispatch(resourceActions.sales.setFilter({ key: 'status', value: e.target.value }))
            }
          >
            <option value="">Todos los estados</option>
            {saleStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="input filter-select"
            value={filters.studentId}
            onChange={(e) =>
              dispatch(resourceActions.sales.setFilter({ key: 'studentId', value: e.target.value }))
            }
          >
            <option value="">Todos los compradores</option>
            {studentOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSearchDraft('');
              dispatch(resourceActions.sales.resetFilters());
            }}
          >
            <IconRefresh size={16} /> Limpiar
          </button>
        </div>

        <ErrorBanner message={error} onClose={() => dispatch(resourceActions.sales.clearError())} />

        <DataTable
          columns={columns}
          rows={items}
          loading={loading}
          onRowClick={setDetailFor}
          empty={
            <EmptyState
              title="Aun no hay ventas"
              hint="Registra la primera venta de la libreria."
              action={
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  <IconPlus size={16} /> Nueva venta
                </button>
              }
            />
          }
        />

        <Pagination meta={meta} onPage={(p) => dispatch(resourceActions.sales.setPage(p))} />
      </div>

      {summary?.topProducts?.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Lo que mas se vende</h2>
          </div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="align-center">Unidades</th>
                  <th className="align-right">Vendido</th>
                  <th className="align-right">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((p) => (
                  <tr key={p.name}>
                    <td data-label="Producto">{p.name}</td>
                    <td data-label="Unidades" className="align-center">{num(p.units, 0)}</td>
                    <td data-label="Vendido" className="align-right">{bs(p.total)}</td>
                    <td data-label="Ganancia" className="align-right text-success">
                      {bs(p.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Nueva venta ---- */}
      <Modal
        open={modalOpen}
        size="lg"
        title="Nueva venta"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="sale-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : `Registrar ${bs(total)}`}
            </button>
          </>
        }
      >
        <form id="sale-form" onSubmit={submit} className="form-grid">
          <ErrorBanner message={formError} onClose={() => setFormError(null)} />

          <Field label="Alumno" hint="Dejalo vacio si es una venta al publico">
            <Select
              value={form.studentId}
              options={studentOptions}
              placeholder="Publico general"
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            />
          </Field>
          <Field label="Nombre del comprador" hint="Solo si no es un alumno registrado">
            <Input
              value={form.buyerName}
              disabled={Boolean(form.studentId)}
              placeholder="Sra. Perez"
              onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
            />
          </Field>

          <div className="field-span-2">
            <h3 className="section-title">Productos</h3>
            <div className="line-picker">
              <Select
                value={picker.productId}
                options={availableProducts}
                placeholder="Elige un producto..."
                onChange={(e) => setPicker({ ...picker, productId: e.target.value })}
              />
              <Input
                type="number"
                step="1"
                min="1"
                value={picker.quantity}
                onChange={(e) => setPicker({ ...picker, quantity: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={addLine}
                disabled={!picker.productId}
              >
                <IconPlus size={16} /> Agregar
              </button>
            </div>

            {lines.length ? (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="align-center">Cantidad</th>
                      <th className="align-right">Precio</th>
                      <th className="align-right">Subtotal</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.productId}>
                        <td data-label="Producto">{l.name}</td>
                        <td data-label="Cantidad" className="align-center">{l.quantity}</td>
                        <td data-label="Precio" className="align-right">
                          <input
                            className="input input-inline"
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.unitPrice}
                            onChange={(e) => setLinePrice(l.productId, e.target.value)}
                          />
                        </td>
                        <td data-label="Subtotal" className="align-right">
                          <strong>{bs(l.unitPrice * l.quantity)}</strong>
                        </td>
                        <td className="align-right">
                          <button
                            type="button"
                            className="icon-btn icon-btn-danger"
                            title="Quitar"
                            onClick={() => removeLine(l.productId)}
                          >
                            <IconClose size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Todavia no has agregado productos.</p>
            )}
          </div>

          <Field label="Descuento" type="number">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
            />
          </Field>
          {/* El precio de lista es una referencia: una impresion a color no
              cuesta lo mismo segun cuanto color lleve. Lo que se escriba aqui
              manda sobre el calculado, y la diferencia queda registrada. */}
          <Field
            label="Precio cobrado al cliente"
            hint={
              ajuste === 0
                ? `Calculado ${bs(calculado)}. Cambialo si cobraste otra cosa`
                : ajuste > 0
                  ? `Calculado ${bs(calculado)} - ${bs(ajuste)} de recargo`
                  : `Calculado ${bs(calculado)} - ${bs(Math.abs(ajuste))} de descuento`
            }
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.chargedTotal}
              placeholder={String(calculado)}
              onChange={(e) => setForm({ ...form, chargedTotal: e.target.value })}
            />
          </Field>
          <Field
            label="Monto recibido"
            hint={`A cobrar ${bs(total)}. Dejalo vacio si pago completo`}
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.paidAmount}
              placeholder={String(total)}
              onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
            />
          </Field>
          <Field label="Metodo de pago">
            <Select
              value={form.method}
              options={methodOptions}
              placeholder={null}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            />
          </Field>
          <Field label="Fecha">
            <Input
              type="date"
              value={form.saleDate}
              onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
            />
          </Field>
          <Field label="Referencia" span={2}>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </Field>
          <Field label="Observaciones" span={2}>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* ---- Detalle ---- */}
      <Modal
        open={Boolean(detailFor)}
        size="md"
        title={`Venta ${detailFor?.receiptNumber || ''}`}
        onClose={() => setDetailFor(null)}
      >
        {detailFor && (
          <div className="statement">
            <div className="mini-stats">
              <div>
                <span>Comprador</span>
                <strong>{detailFor.buyer}</strong>
              </div>
              <div>
                <span>Fecha</span>
                <strong>{date(detailFor.saleDate)}</strong>
              </div>
              <div>
                <span>Metodo</span>
                <strong>{label('method', detailFor.method)}</strong>
              </div>
              {detailFor.reference && (
                <div>
                  <span>Referencia</span>
                  <strong>{detailFor.reference}</strong>
                </div>
              )}
            </div>

            <h3 className="section-title">Articulos</h3>
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="align-center">Cant.</th>
                    <th className="align-right">Precio</th>
                    <th className="align-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailFor.items || []).map((i) => (
                    <tr key={i.id}>
                      <td data-label="Producto">{i.name}</td>
                      <td data-label="Cant." className="align-center">{i.quantity}</td>
                      <td data-label="Precio" className="align-right">{bs(i.unitPrice)}</td>
                      <td data-label="Subtotal" className="align-right">{bs(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mini-stats">
              <div>
                <span>Subtotal</span>
                <strong>{bs(detailFor.subtotal)}</strong>
              </div>
              <div>
                <span>Descuento</span>
                <strong>{bs(detailFor.discount)}</strong>
              </div>
              <div>
                <span>Cobrado</span>
                <strong className="text-success">{bs(detailFor.paidAmount)}</strong>
              </div>
              <div className="mini-stats-total">
                <span>Total</span>
                <strong>{bs(detailFor.total)}</strong>
              </div>
            </div>

            {detailFor.notes && <p className="muted">{detailFor.notes}</p>}
          </div>
        )}
      </Modal>

      {/* ---- Abono ---- */}
      <Modal
        open={Boolean(settleFor)}
        size="sm"
        title="Registrar abono"
        onClose={() => setSettleFor(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setSettleFor(null)}>
              Cancelar
            </button>
            <button type="submit" form="sale-settle" className="btn btn-primary" disabled={saving}>
              Registrar
            </button>
          </>
        }
      >
        <form id="sale-settle" onSubmit={submitSettle} className="form-grid">
          <p className="muted field-span-2">
            {settleFor?.receiptNumber} - saldo{' '}
            <strong className="text-warning">{bs(settleFor?.balance)}</strong>
          </p>
          <Field label="Monto" required span={2}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={settleFor?.balance}
              required
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(voidFor)}
        title="Anular venta"
        message={`Se anulara ${voidFor?.receiptNumber} y los productos volveran al inventario. El registro se conserva.`}
        confirmText="Anular"
        busy={saving}
        onCancel={() => setVoidFor(null)}
        onConfirm={submitVoid}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar venta"
        message="Se borra el registro por completo. Si la venta no estaba anulada, el stock vuelve al inventario."
        confirmText="Eliminar"
        busy={saving}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}

/* ================================================================== */
/* Personal                                                            */
/* ================================================================== */

/**
 * Quien atiende la libreria y cuanto gana. Lo que se pacta aqui es la base
 * de su nomina, que se lleva en Nomina > Libreria.
 */
function StaffTab() {
  const dispatch = useDispatch();
  const weeksPerMonth = useSelector((s) => s.options.settings.weeksPerMonth);
  const daysPerWeek = useSelector((s) => s.options.settings.daysPerWeek);
  const profile = useSelector((s) => s.staff.profile);
  const [profileFor, setProfileFor] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // El pago semanal es lo que consume la nomina; de ahi salen el mes y la hora.
  const weeklyFrom = (values) => {
    const amount = Number(values.payAmount || 0);
    const hours = Number(values.weeklyHours || 0);
    if (values.payType === 'mensual') return amount / weeksPerMonth;
    if (values.payType === 'por_hora') return amount * hours;
    return amount;
  };

  const computePay = (values) => {
    const weekly = weeklyFrom(values);
    const hours = Number(values.weeklyHours || 0);

    return (
      <>
        <div>
          <span>A la semana</span>
          <strong>{money(weekly)}</strong>
        </div>
        <div>
          <span>Al mes ({weeksPerMonth} semanas)</span>
          <strong className="text-success">{money(weekly * weeksPerMonth)}</strong>
        </div>
        <div>
          <span>Por dia ({daysPerWeek} dias)</span>
          <strong>{daysPerWeek > 0 ? money(weekly / daysPerWeek) : money(0)}</strong>
        </div>
        <div>
          <span>Por hora</span>
          <strong>
            {values.payType === 'por_hora' ? (
              money(values.payAmount)
            ) : hours > 0 ? (
              money(weekly / hours)
            ) : (
              <span className="muted">Indica las horas</span>
            )}
          </strong>
        </div>
      </>
    );
  };

  const openProfile = async (row) => {
    setProfileFor(row);
    setLoadingProfile(true);
    await dispatch(staffThunks.fetchStaffProfile(row.id));
    setLoadingProfile(false);
  };

  const columns = [
    {
      key: 'fullName',
      header: 'Trabajador',
      render: (r) => (
        <div className="cell-stack">
          <strong>{r.fullName || r.firstName}</strong>
          <small>{r.position || r.documentId || ''}</small>
        </div>
      ),
    },
    {
      key: 'payType',
      header: 'Pago pactado',
      render: (r) => (
        <div className="cell-stack">
          <span>{label('payType', r.payType)}</span>
          <small>{money(r.payAmount)}</small>
        </div>
      ),
    },
    {
      key: 'weeklySalary',
      header: 'A la semana',
      align: 'right',
      render: (r) => (
        <div className="cell-stack align-right">
          <span>{money(r.weeklySalary)}</span>
          {Number(r.dailyRate) > 0 && <small>{money(r.dailyRate)} al dia</small>}
        </div>
      ),
    },
    {
      key: 'monthlySalary',
      header: 'Sueldo del mes',
      align: 'right',
      render: (r) => <strong>{money(r.monthlySalary)}</strong>,
    },
    {
      key: 'hourlyRate',
      header: 'Por hora',
      align: 'right',
      render: (r) => (
        <div className="cell-stack align-right">
          <span>{money(r.hourlyRate)}</span>
          <small>{num(r.weeklyHours, 0)} h/semana</small>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      align: 'center',
      render: (r) => <Badge value={r.status} group="teacherStatus" />,
    },
  ];

  const formFields = [
    { name: 'firstName', label: 'Nombre', required: true },
    { name: 'lastName', label: 'Apellido' },
    { name: 'documentId', label: 'Cedula' },
    { name: 'position', label: 'Cargo', placeholder: 'Encargado de libreria' },
    { name: 'phone', label: 'Telefono' },
    { name: 'email', label: 'Correo', type: 'email' },
    { name: 'address', label: 'Direccion', span: 2 },
    {
      name: 'payType',
      label: 'Tipo de pago',
      type: 'select',
      options: payTypeOptions,
      defaultValue: 'semanal',
      placeholder: null,
    },
    {
      name: 'payAmount',
      label: 'Monto acordado',
      type: 'number',
      defaultValue: 0,
      hint: 'Lo que gana segun el tipo de pago elegido',
    },
    {
      name: 'weeklyHours',
      label: 'Horas por semana',
      type: 'number',
      defaultValue: 0,
      hint: 'Sirve para sacar la tarifa por hora',
    },
    { name: '__calculo', label: 'Lo que cobrara', type: 'computed', span: 2, compute: computePay },
    { name: 'hireDate', label: 'Fecha de ingreso', type: 'date' },
    {
      name: 'status',
      label: 'Estado',
      type: 'select',
      options: staffStatusOptions,
      defaultValue: 'activo',
      placeholder: null,
    },
    { name: 'notes', label: 'Observaciones', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <ResourcePage
        title="Personal de la libreria"
        subtitle="Quien atiende la libreria y lo que gana"
        sliceName="staff"
        thunks={staffThunks}
        actions={resourceActions.staff}
        columns={columns}
        entityName="trabajador"
        entityNamePlural="trabajadores"
        createLabel="Nuevo trabajador"
        searchPlaceholder="Buscar por nombre, cedula o cargo..."
        formSize="lg"
        filters={[
          { key: 'status', label: 'Todos los estados', options: staffStatusOptions },
          { key: 'payType', label: 'Todos los pagos', options: payTypeOptions },
        ]}
        formFields={formFields}
        rowActions={(row) => (
          <button
            type="button"
            className="icon-btn"
            title="Ver ficha"
            onClick={() => openProfile(row)}
          >
            <IconEye size={16} />
          </button>
        )}
      />

      <Modal
        open={Boolean(profileFor)}
        size="lg"
        title={`Ficha de ${profileFor?.fullName || ''}`}
        onClose={() => setProfileFor(null)}
      >
        {loadingProfile || !profile ? (
          <Loader text="Cargando ficha..." />
        ) : (
          <>
            <div className="stat-grid stat-grid-sm">
              <StatCard label="Devengado" value={money(profile.summary.totalAccrued)} />
              <StatCard label="Pagado" value={money(profile.summary.totalPaid)} tone="success" />
              <StatCard
                label="Saldo pendiente"
                value={money(profile.summary.pendingBalance)}
                tone={profile.summary.pendingBalance > 0 ? 'warning' : 'success'}
              />
              <StatCard label="Recibos" value={profile.summary.paymentsCount} />
            </div>

            {profile.payments.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Recibo</th>
                      <th>Concepto</th>
                      <th className="align-right">Total</th>
                      <th className="align-right">Pagado</th>
                      <th className="align-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.payments.map((p) => (
                      <tr key={p.id}>
                        <td data-label="Recibo">{p.receiptNumber || `#${p.id}`}</td>
                        <td data-label="Concepto">{p.concept}</td>
                        <td data-label="Total" className="align-right">{money(p.total)}</td>
                        <td data-label="Pagado" className="align-right">{money(p.paidAmount)}</td>
                        <td data-label="Estado" className="align-center">
                          <Badge value={p.status} group="paymentStatus" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Sin recibos"
                hint="Genera la nomina desde Nomina > Libreria."
              />
            )}
          </>
        )}
      </Modal>
    </>
  );
}

/* ================================================================== */
/* Estadisticas                                                        */
/* ================================================================== */

/**
 * Como le va a la libreria: que se vende mas, cuanto se gana sobre lo
 * vendido y como se reparten las ventas a lo largo del anio.
 */
function StatsTab() {
  const dispatch = useDispatch();
  const summary = useSelector((s) => s.sales.summary);

  useEffect(() => {
    dispatch(saleThunks.fetchSalesSummary());
  }, [dispatch]);

  if (!summary) return <Loader text="Cargando estadisticas..." />;

  const { overall, month, topProducts, byMonth, period } = summary;
  const sinVentas = overall.count === 0;

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Estadisticas</h1>
          <p className="page-sub">Como se mueve la libreria: lo que mas sale y lo que deja</p>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard
          label="Vendido en total"
          value={bs(overall.total)}
          hint={`${overall.count} venta(s) - ${num(overall.unitsSold, 0)} articulo(s)`}
          tone="info"
        />
        <StatCard
          label="Ganancia acumulada"
          value={bs(overall.profit)}
          hint="Lo vendido menos lo que costo la mercancia"
          tone="success"
          valueTone="success"
        />
        <StatCard
          label="Porcentaje de ganancia"
          value={`${num(overall.marginPct, 1)} %`}
          hint={`De cada ${bs(100)} que entran, ${bs(overall.marginPct)} son ganancia`}
          tone="success"
        />
        <StatCard
          label={`Vendido en ${MONTHS[period.month - 1]}`}
          value={bs(month.total)}
          hint={month.count ? `${month.count} venta(s) - ${num(month.marginPct, 1)} % de ganancia` : 'Sin ventas este mes'}
          tone="info"
        />
      </div>

      {sinVentas ? (
        <EmptyState
          title="Todavia no hay ventas"
          hint="Cuando registres la primera venta apareceran aqui los productos mas vendidos y el resumen del anio."
        />
      ) : (
        <div className="grid-2">
          <div className="card">
            <div className="card-head">
              <h2>Ventas mensuales {period.year}</h2>
              <Legend
                items={[
                  { label: 'Vendido', color: 'var(--accent-info)' },
                  { label: 'Ganancia', color: 'var(--accent-success)' },
                ]}
              />
            </div>
            <BarChart
              data={byMonth}
              keys={['total', 'profit']}
              colors={['var(--accent-info)', 'var(--accent-success)']}
              formatValue={(v) => num(v, 0)}
            />
            <p className="muted footnote">Montos en bolivares.</p>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Productos mas vendidos</h2>
              <small className="muted">Por unidades</small>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="align-center">Unidades</th>
                    <th className="align-right">Vendido</th>
                    <th className="align-right">Ganancia</th>
                    <th className="align-right">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.name}>
                      <td data-label="Producto">
                        <div className="cell-stack">
                          <strong>{p.name}</strong>
                          {/* La barra deja ver de un golpe quien manda. */}
                          <span className="share-bar" title={`${num(p.sharePct, 1)} % de lo vendido`}>
                            <span style={{ width: `${Math.min(100, p.sharePct)}%` }} />
                          </span>
                        </div>
                      </td>
                      <td data-label="Unidades" className="align-center">
                        <strong>{num(p.units, 0)}</strong>
                      </td>
                      <td data-label="Vendido" className="align-right">{bs(p.total)}</td>
                      <td data-label="Ganancia" className="align-right text-success">
                        {bs(p.profit)}
                      </td>
                      <td data-label="Margen" className="align-right">{num(p.marginPct, 1)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ================================================================== */

export default function Library() {
  const [tab, setTab] = useState('ventas');

  return (
    <div className="tabbed">
      <ExchangeRate />

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === 'ventas' ? 'is-active' : ''}`}
          onClick={() => setTab('ventas')}
        >
          Ventas
        </button>
        <button
          type="button"
          className={`tab ${tab === 'productos' ? 'is-active' : ''}`}
          onClick={() => setTab('productos')}
        >
          Productos
        </button>
        <button
          type="button"
          className={`tab ${tab === 'personal' ? 'is-active' : ''}`}
          onClick={() => setTab('personal')}
        >
          Personal
        </button>
        <button
          type="button"
          className={`tab ${tab === 'estadisticas' ? 'is-active' : ''}`}
          onClick={() => setTab('estadisticas')}
        >
          Estadisticas
        </button>
      </div>

      {tab === 'ventas' && <SalesTab />}
      {tab === 'productos' && <ProductsTab />}
      {tab === 'personal' && <StaffTab />}
      {tab === 'estadisticas' && <StatsTab />}
    </div>
  );
}
