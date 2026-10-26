import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../api/client';

/**
 * Catalogos ligeros y parametros de la academia que alimentan los selects
 * y los valores por defecto de los formularios. Se cargan al entrar.
 */
export const fetchOptions = createAsyncThunk('options/fetchAll', async (_, { rejectWithValue }) => {
  try {
    const [studs, teach, prods, workers, settings] = await Promise.all([
      api.get('/students/options'),
      api.get('/teachers/options'),
      api.get('/library/products/options'),
      api.get('/library/staff/options'),
      api.get('/settings'),
    ]);

    // La tasa sale de una fuente externa: si no responde, la app sigue
    // funcionando y la pantalla avisa de que no hay tasa del dia.
    let rate = { rate: null, date: null, stale: true };
    try {
      const res = await api.get('/settings/exchange-rate');
      rate = res.data.data;
    } catch {
      /* se queda sin tasa */
    }

    return {
      students: studs.data.data,
      teachers: teach.data.data,
      products: prods.data.data,
      staff: workers.data.data,
      settings: settings.data.data,
      exchangeRate: rate,
    };
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

const slice = createSlice({
  name: 'options',
  initialState: {
    students: [],
    teachers: [],
    products: [],
    staff: [],
    exchangeRate: { rate: null, date: null, stale: true },
    settings: {
      currency: 'USD',
      baseMonthlyFee: 70,
      baseStudentRate: 5,
      weeksPerMonth: 4,
      daysPerWeek: 5,
      period: null,
      today: null,
      baseEnrollmentFee: 0,
      libraryCurrency: 'VES',
      academyStartDate: '2026-09-15',
    },
    loaded: false,
    loading: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOptions.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchOptions.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
        state.loading = false;
        state.loaded = true;
      })
      .addCase(fetchOptions.rejected, (state) => {
        state.loading = false;
      });
  },
});

export default slice.reducer;
