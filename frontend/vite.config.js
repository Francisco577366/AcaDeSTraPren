import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Politica de seguridad de contenido.
 *
 * El token de sesion vive en localStorage, asi que cualquier script ajeno que
 * llegue a ejecutarse podria leerlo. La defensa no es esconder el token: es
 * que no haya forma de ejecutar un script ajeno. De ahi 'script-src self',
 * sin unsafe-inline y sin unsafe-eval, que es la directiva que de verdad
 * importa aqui.
 *
 * - default-src 'none'   nada esta permitido salvo lo que se abra abajo.
 * - script-src 'self'    solo los bundles que sirve este mismo dominio.
 * - style-src unsafe-inline  la aplicacion usa style={{...}} de React, que
 *                        son atributos de estilo en linea. Es un riesgo de
 *                        otra categoria: con CSS no se ejecuta codigo.
 * - connect-src          el API vive en OTRO dominio, asi que hay que
 *                        nombrarlo. Sin esto el navegador cortaria cada
 *                        peticion, y de paso cierra la via de exfiltrar datos
 *                        a un servidor cualquiera.
 * - img-src data:        los graficos y los iconos se generan en linea.
 *
 * Dos cosas que NO se pueden poner aqui: frame-ancestors y report-uri. En una
 * etiqueta meta el navegador las ignora, solo valen como cabecera HTTP, y
 * GitHub Pages no permite anadir cabeceras. Queda anotado en el README.
 */
function politicaCsp(apiUrls) {
  // Del API solo hace falta el origen, no la ruta: connect-src no entiende de
  // rutas y una URL con /api dentro invalidaria la directiva.
  const origenDe = (url) => {
    try {
      return url ? new URL(url).origin : '';
    } catch {
      return '';
    }
  };

  /*
   * Es una sola, pero se admite lista: la demostracion comparte API con la
   * academia (el backend separa por base, no por dominio) y aqui no hay nada
   * que anadir. Queda asi por si algun dia el API se parte en dos.
   */
  const origenApi = [...new Set(apiUrls.map(origenDe).filter(Boolean))].join(' ');

  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${origenApi ? ` ${origenApi}` : ''}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const csp = politicaCsp([env.VITE_API_URL]);

  return {
    /**
     * GitHub Pages sirve un proyecto en /nombre-del-repositorio/, no en la
     * raiz. Sin esto los bundles se buscarian en / y la pagina saldria en
     * blanco. En local y en cualquier dominio propio se queda en '/'.
     */
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      {
        /*
         * GitHub Pages sirve ficheros, no conoce las rutas de una SPA: al
         * entrar directo a /alumnos busca un fichero que no existe y responde
         * 404. Lo que si hace es servir 404.html cuando no encuentra algo, asi
         * que se publica una copia del index: carga la aplicacion, el router
         * lee la direccion y sale la pantalla correcta.
         *
         * Es la unica forma en Pages, que no deja configurar redirecciones.
         */
        name: 'pages-404',
        // Al cerrar, y no en generateBundle: el index.html lo procesa el
        // plugin de HTML por su cuenta y no esta en el paquete todavia.
        closeBundle() {
          const salida = path.resolve(process.cwd(), 'dist');
          const index = path.join(salida, 'index.html');
          if (fs.existsSync(index)) fs.copyFileSync(index, path.join(salida, '404.html'));
        },
      },
      {
        name: 'csp-meta',
        /**
         * La CSP se inyecta en el build y no se escribe a mano en el
         * index.html porque depende de donde viva el API, que cambia entre
         * local y produccion.
         */
        transformIndexHtml(html) {
          return html.replace(
            '</title>',
            `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`
          );
        },
      },
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Necesario para que el hot reload funcione dentro del contenedor
      watch: { usePolling: true },
      proxy: {
        '/api': {
          target: 'http://backend:4000',
          changeOrigin: true,
        },
      },
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
