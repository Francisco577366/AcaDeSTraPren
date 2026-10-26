import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../api/client';

/** La actividad de una persona: la propia, o la de otra si eres admin. */
export const fetchActivity = createAsyncThunk(
  'activity/mine',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/activity', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/** El cuadro comparativo de todas las personas. Solo administrador. */
export const fetchAllActivity = createAsyncThunk(
  'activity/all',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/activity/all', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const slice = createSlice({
  name: 'activity',
  initialState: { detalle: null, todos: null, loading: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchActivity.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.loading = false;
        state.detalle = action.payload;
      })
      .addCase(fetchActivity.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchAllActivity.fulfilled, (state, action) => {
        state.todos = action.payload;
      })
      .addCase(fetchAllActivity.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export default slice.reducer;
