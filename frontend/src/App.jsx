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
        <Route index element={<Dashboard />} />
        <Route path="alumnos" element={<Students />} />
        <Route path="profesores" element={<Teachers />} />
        <Route path="pagos" element={<Payments />} />
        <Route path="nomina" element={<SoloAdmin><Payroll /></SoloAdmin>} />
        <Route path="trabajos" element={<Works />} />
        <Route path="libreria" element={<Library />} />
        <Route path="alquiler" element={<SoloAdmin><Rent /></SoloAdmin>} />
        <Route path="personales" element={<SoloAdmin><Personal /></SoloAdmin>} />
        <Route path="actividad" element={<Actividad />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
