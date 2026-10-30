import { useState } from 'react';
import { Modal } from './ui';

/*
 * Las credenciales de la demostracion, resueltas AL CONSTRUIR.
 *
 * En el build de produccion estas variables no existen, asi que `hayDemo` es
 * falso, el componente no se pinta y las cadenas no llegan al bundle. No es
 * una comprobacion en el navegador que alguien pueda saltarse: es que el
 * codigo con los datos no se genera.
 */
const CORREO = import.meta.env.VITE_DEMO_EMAIL || '';
const CLAVE = import.meta.env.VITE_DEMO_PASSWORD || '';

export const hayDemo = Boolean(CORREO && CLAVE);

/**
 * Aviso de bienvenida de la demostracion.
 *
 * Quien llega desde un enlace de LinkedIn se encuentra una pantalla de acceso
 * y ningun dato que escribir, que es una puerta cerrada. Esto se los da.
 *
 * Y dice de que son los datos: alguien que ve nombres de alumnos y cifras de
 * cobros tiene todo el derecho a pensar que esta mirando la informacion de
 * personas reales. No lo es, y conviene decirlo antes de que entre, no
 * despues.
 *
 * @param {(datos: {email: string, password: string}) => void} onEntrar
 * @param {boolean} entrando  Si hay un intento de acceso en curso.
 */
export default function AvisoDemo({ onEntrar, entrando }) {
  const [abierto, setAbierto] = useState(true);

  if (!hayDemo) return null;

  return (
    <>
      <Modal
        open={abierto}
        title="Esto es una demostracion"
        onClose={() => setAbierto(false)}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAbierto(false)}
              disabled={entrando}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onEntrar({ email: CORREO, password: CLAVE })}
              disabled={entrando}
            >
              {entrando ? 'Entrando...' : 'Entrar como visitante'}
            </button>
          </>
        }
      >
        <p className="confirm-text">
          Los alumnos, los pagos y las ventas que vas a ver son inventados. No hay
          datos de ninguna persona real.
        </p>

        <p className="field-label">Si quieres entrar a mirar, usa estos datos:</p>
        <dl className="demo-datos">
          <dt>Correo</dt>
          <dd>{CORREO}</dd>
          <dt>Contrasena</dt>
          <dd>{CLAVE}</dd>
        </dl>

        <p className="confirm-text">
          Puedes crear y editar registros para probar. Lo que no puede esta cuenta es
          borrar ni cambiar su propia contrasena: la comparten todos los visitantes, y
          el primero que la cambiara dejaria fuera a los demas.
        </p>
      </Modal>

      {/* Si lo cierra sin apuntar la clave, que pueda volver a verla. */}
      {!abierto && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => setAbierto(true)}
        >
          Ver los datos de acceso
        </button>
      )}
    </>
  );
}
