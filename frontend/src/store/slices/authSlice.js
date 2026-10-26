import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api, { TOKEN_KEY } from '../../api/client';

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    localStorage.setItem(TOKEN_KEY, data.data.token);
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const loadSession = createAsyncThunk('auth/loadSession', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/auth/me');
    return data.data;
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    return rejectWithValue(error.message);
  }
});

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/change-password', payload);
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const slice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    // Arrancamos comprobando la sesion solo si hay token guardado.
    checking: Boolean(localStorage.getItem(TOKEN_KEY)),
    loading: false,
    error: null,
  },
  reducers: {
    logout(state) {
      localStorage.removeItem(TOKEN_KEY);
      state.user = null;
      state.token = null;
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'No se pudo iniciar sesion';
      })
      .addCase(loadSession.pending, (state) => {
        state.checking = true;
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        state.checking = false;
        state.user = action.payload;
      })
      .addCase(loadSession.rejected, (state) => {
        state.checking = false;
        state.user = null;
        state.token = null;
      });
  },
});

export const { logout, clearError } = slice.actions;
export default slice.reducer;
