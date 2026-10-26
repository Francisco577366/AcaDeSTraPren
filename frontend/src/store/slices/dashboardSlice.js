import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../api/client';

export const fetchOverview = createAsyncThunk(
  'dashboard/overview',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/dashboard/overview', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchCashflow = createAsyncThunk(
  'dashboard/cashflow',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/dashboard/cashflow', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchDebtors = createAsyncThunk(
  'dashboard/debtors',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/students/debtors', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const slice = createSlice({
  name: 'dashboard',
  initialState: {
    overview: null,
    cashflow: null,
    debtors: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOverview.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.loading = false;
        state.overview = action.payload;
      })
      .addCase(fetchOverview.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchCashflow.fulfilled, (state, action) => {
        state.cashflow = action.payload;
      })
      .addCase(fetchDebtors.fulfilled, (state, action) => {
        state.debtors = action.payload;
      });
  },
});

export default slice.reducer;
