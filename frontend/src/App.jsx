import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadSession } from './store/slices/authSlice';
import Layout from './components/Layout';
import { Loader } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Teachers from './pages/Teachers';
import Payments from './pages/Payments';
import Payroll from './pages/Payroll';
import Works from './pages/Works';
import Library from './pages/Library';
import Rent from './pages/Rent';
import Personal from './pages/Personal';
import Actividad from './pages/Actividad';

function Protected({ children }) {
  const { user, token, checking } = useSelector((s) => s.auth);

  if (checking) {
    return (
      <div className="boot-screen">
        <Loader text="Verificando sesion..." />
      </div>
    );
  }
  if (!token || !user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Secciones que no son de la libreria.
 *
 * Quien atiende el mostrador no tiene nada que hacer en el resto de la
 * academia, ni siquiera en el panel: el API le rechaza esas rutas, asi que
 * aqui se le devuelve a lo suyo en vez de dejarle ver una pantalla que se
 * llenaria de errores.
 *
 * Envuelve TODAS las rutas menos /libreria. Esconder el enlace del menu no
 * basta: escribiendo la direccion a mano la pagina cargaria igual.
 */
function FueraDeLibreria({ children }) {
  const user = useSelector((s) => s.auth.user);
  if (user?.role === 'libreria') return <Navigate to="/libreria" replace />;
  return children;
}

/**
 * Secciones del administrador. Esconder el enlace en el menu no basta:
 * escribiendo la direccion a mano la pagina cargaria igual y se llenaria de
 * errores al llamar al API. Esto no es la seguridad (esa la hace el API, que
 * rechaza las rutas) sino no ensenar una puerta que no se puede abrir.
 */
function SoloAdmin({ children }) {
  const user = useSelector((s) => s.auth.user);
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

/**
 * Como SoloAdmin, pero deja pasar tambien a la cuenta de visita.
 *
 * Lo que esta detras son los pagos personales. Al administrador le muestran
 * sus retiros de verdad; a la visita, los que ella misma se invente. El API
 * ya solo le devuelve los suyos, asi que la pantalla sale llena de lo suyo y
 * de nada mas.
 */
function AdminODemo({ children }) {
  const user = useSelector((s) => s.auth.user);
  if (user?.role !== 'admin' && user?.role !== 'demo') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const dispatch = useDispatch();
  const { token, user } = useSelector((s) => s.auth);

  // Si hay token guardado, recuperamos el usuario antes de pintar la app.
  useEffect(() => {
    if (token && !user) dispatch(loadSession());
  }, [dispatch, token, user]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<FueraDeLibreria><Dashboard /></FueraDeLibreria>} />
        <Route path="alumnos" element={<FueraDeLibreria><Students /></FueraDeLibreria>} />
        <Route path="profesores" element={<FueraDeLibreria><Teachers /></FueraDeLibreria>} />
        <Route path="pagos" element={<FueraDeLibreria><Payments /></FueraDeLibreria>} />
        <Route path="nomina" element={<SoloAdmin><Payroll /></SoloAdmin>} />
        <Route path="trabajos" element={<FueraDeLibreria><Works /></FueraDeLibreria>} />
        <Route path="libreria" element={<Library />} />
        <Route path="alquiler" element={<SoloAdmin><Rent /></SoloAdmin>} />
        <Route path="personales" element={<AdminODemo><Personal /></AdminODemo>} />
        <Route path="actividad" element={<FueraDeLibreria><Actividad /></FueraDeLibreria>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
