import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import { toggleSidebar, dismissToast } from '../store/slices/uiSlice';
import { fetchOptions } from '../store/slices/optionsSlice';
import { syncPeriod } from '../store/slices/periodSlice';
import PeriodPicker from './PeriodPicker';
import { label } from '../utils/format';
import {
  IconDashboard, IconUsers, IconStudent, IconTeacher, IconBook,
  IconMoney, IconWallet, IconHome, IconTool, IconLogout,
  IconMenu, IconClose, IconCheck, IconAlert, IconReceipt,
} from './Icons';

// Swagger vive junto al API, sea cual sea el host configurado.
const DOCS_URL = `${import.meta.env.VITE_API_URL || '/api'}/docs`;

/*
 * Las secciones marcadas soloAdmin no se le muestran a quien no lo es.
 * Esconderlas es por comodidad, no es la seguridad: quien la haga de verdad
 * es el API, que rechaza esas rutas. Aqui solo evitamos ensenar puertas que
 * al abrirlas van a dar un error.
 */
const NAV = [
  { to: '/', label: 'Panel', icon: IconDashboard, end: true },
  { to: '/alumnos', label: 'Alumnos', icon: IconStudent },
  { to: '/profesores', label: 'Profesores', icon: IconTeacher },
  { to: '/pagos', label: 'Pagos', icon: IconMoney },
  { to: '/nomina', label: 'Nomina', icon: IconWallet, soloAdmin: true },
  { to: '/trabajos', label: 'Trabajos', icon: IconTool },
  { to: '/libreria', label: 'Libreria', icon: IconBook },
  { to: '/alquiler', label: 'Alquiler', icon: IconHome, soloAdmin: true },
  { to: '/personales', label: 'Pagos personales', icon: IconUsers, soloAdmin: true },
  { to: '/actividad', label: 'Actividad', icon: IconReceipt },
];

function Toasts() {
  const toasts = useSelector((s) => s.ui.toasts);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timers = toasts.map((t) => setTimeout(() => dispatch(dismissToast(t.id)), 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'error' ? <IconAlert size={16} /> : <IconCheck size={16} />}
          <span>{t.message}</span>
          <button type="button" className="icon-btn" onClick={() => dispatch(dismissToast(t.id))}>
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const esAdmin = user?.role === 'admin';
  const sidebarOpen = useSelector((s) => s.ui.sidebarOpen);
  const optionsLoaded = useSelector((s) => s.options.loaded);
  const serverPeriod = useSelector((s) => s.options.settings.period);

  // Catalogos para los selects: se cargan una vez por sesion.
  useEffect(() => {
    if (!optionsLoaded) dispatch(fetchOptions());
  }, [dispatch, optionsLoaded]);

  // El mes de trabajo arranca en el del servidor, no en el del navegador.
  useEffect(() => {
    if (serverPeriod) dispatch(syncPeriod(serverPeriod));
  }, [dispatch, serverPeriod]);

  const doLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : 'AD';

  return (
    <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>Academia</strong>
            <small>Administracion</small>
          </div>
        </div>

        <nav className="nav">
          {NAV.filter((i) => !i.soloAdmin || esAdmin).map(({ to, label: text, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => dispatch(toggleSidebar(false))}
            >
              <Icon size={18} />
              <span>{text}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <a className="nav-item" href={DOCS_URL} target="_blank" rel="noreferrer">
            <IconBook size={18} />
            <span>Documentacion API</span>
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn only-mobile"
            onClick={() => dispatch(toggleSidebar())}
            aria-label="Menu"
          >
            {sidebarOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
          </button>

          <PeriodPicker />

          <div className="topbar-spacer" />

          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="user-meta">
              <strong>{user?.name || 'Usuario'}</strong>
              <small>{label('role', user?.role)}</small>
            </div>
          </div>

          <button type="button" className="icon-btn" title="Cerrar sesion" onClick={doLogout}>
            <IconLogout size={18} />
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <div
        className="sidebar-scrim"
        onClick={() => dispatch(toggleSidebar(false))}
        aria-hidden="true"
      />
      <Toasts />
    </div>
  );
}
