import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { login, clearError } from '../store/slices/authSlice';
import { ErrorBanner } from '../components/ui';

export default function Login() {
  const dispatch = useDispatch();
  const { user, loading, error } = useSelector((s) => s.auth);
  const [form, setForm] = useState({ email: '', password: '' });

  if (user) return <Navigate to="/" replace />;

  const submit = (e) => {
    e.preventDefault();
    dispatch(login(form));
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark lg">A</div>
          <h1>Academia</h1>
          <p>Sistema administrativo</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <ErrorBanner message={error} onClose={() => dispatch(clearError())} />

          <label className="field-label" htmlFor="email">
            Correo electronico
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="admin@academia.com"
          />

          <label className="field-label" htmlFor="password">
            Contrasena
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="********"
          />

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

      </div>
    </div>
  );
}
