import { createSlice } from '@reduxjs/toolkit';

const now = new Date();

/**
 * El mes de trabajo, compartido por toda la aplicacion.
 *
 * Al cerrar un mes se siguen registrando cobros del anterior, asi que no sirve
 * atarse al calendario: aqui se elige el periodo una vez y todas las secciones
 * —el panel, los cobros, las nominas, el alquiler— hablan de ese mes.
 *
 * Arranca en el mes del navegador y se corrige con el del servidor en cuanto
 * llega la configuracion: la academia puede estar en otra zona horaria.
 */
const slice = createSlice({
  name: 'period',
  initialState: {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    // Mientras sea false el usuario no lo ha tocado y puede ajustarse solo.
    chosen: false,
  },
  reducers: {
    setPeriod(state, action) {
      const { month, year } = action.payload;
      if (month) state.month = Number(month);
      if (year) state.year = Number(year);
      state.chosen = true;
    },
    /** El periodo real segun el servidor; no pisa lo que el usuario eligio. */
    syncPeriod(state, action) {
      if (state.chosen) return;
      const { month, year } = action.payload || {};
      if (month) state.month = Number(month);
      if (year) state.year = Number(year);
    },
  },
});

export const { setPeriod, syncPeriod } = slice.actions;
export default slice.reducer;
