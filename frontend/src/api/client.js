import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

export const TOKEN_KEY = 'academia_token';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // Sesion caducada: limpiamos y devolvemos al login.
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }

    const message =
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED'
        ? 'El servidor tardo demasiado en responder'
        : 'No se pudo conectar con el servidor');

    return Promise.reject({
      message,
      status,
      details: error.response?.data?.details || null,
    });
  }
);

export default api;
