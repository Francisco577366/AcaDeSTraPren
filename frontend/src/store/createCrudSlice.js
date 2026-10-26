import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../api/client';

/**
 * Genera un slice completo (listar, crear, editar, eliminar) para un
 * recurso REST. Todas las secciones administrativas comparten esta forma,
 * asi que centralizamos el estado y los thunks en un solo lugar.
 *
 * @param {string} name      Nombre del slice, p.ej. "students".
 * @param {string} endpoint  Ruta del API, p.ej. "/students".
 * @param {object} extra     Filtros iniciales y reducers adicionales.
 */
export function createCrudSlice(name, endpoint, extra = {}) {
  const { initialFilters = {}, extraThunks = {}, extraReducers = () => {} } = extra;

  const fetchAll = createAsyncThunk(`${name}/fetchAll`, async (params = {}, { getState, rejectWithValue }) => {
    try {
      const state = getState()[name];
      const query = { page: state.page, limit: state.limit, ...state.filters, ...params };

      Object.keys(query).forEach((k) => {
        if (query[k] === '' || query[k] === null || query[k] === undefined) delete query[k];
      });

      const { data } = await api.get(endpoint, { params: query });
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  });

  const fetchOne = createAsyncThunk(`${name}/fetchOne`, async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`${endpoint}/${id}`);
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  });

  const createItem = createAsyncThunk(`${name}/create`, async (payload, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(endpoint, payload);
      dispatch(fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  });

  const updateItem = createAsyncThunk(`${name}/update`, async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.put(`${endpoint}/${id}`, payload);
      dispatch(fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  });

  const deleteItem = createAsyncThunk(`${name}/delete`, async (id, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.delete(`${endpoint}/${id}`);
      dispatch(fetchAll());
      return { id, ...data };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  });

  const initialState = {
    items: [],
    current: null,
    meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    page: 1,
    limit: 10,
    filters: { search: '', ...initialFilters },
    loading: false,
    saving: false,
    error: null,
  };

  const slice = createSlice({
    name,
    initialState,
    reducers: {
      setPage(state, action) {
        state.page = action.payload;
      },
      setLimit(state, action) {
        state.limit = action.payload;
        state.page = 1;
      },
      setFilter(state, action) {
        const { key, value } = action.payload;
        state.filters[key] = value;
        state.page = 1;
      },
      resetFilters(state) {
        state.filters = { search: '', ...initialFilters };
        state.page = 1;
      },
      clearCurrent(state) {
        state.current = null;
      },
      clearError(state) {
        state.error = null;
      },
    },
    extraReducers: (builder) => {
      builder
        .addCase(fetchAll.pending, (state) => {
          state.loading = true;
          state.error = null;
        })
        .addCase(fetchAll.fulfilled, (state, action) => {
          state.loading = false;
          state.items = action.payload.data || [];
          if (action.payload.meta) {
            state.meta = action.payload.meta;
            state.page = action.payload.meta.page;
          }
        })
        .addCase(fetchAll.rejected, (state, action) => {
          state.loading = false;
          state.error = action.payload || 'Error al cargar los datos';
        })
        .addCase(fetchOne.fulfilled, (state, action) => {
          state.current = action.payload;
        });

      [createItem, updateItem, deleteItem].forEach((thunk) => {
        builder
          .addCase(thunk.pending, (state) => {
            state.saving = true;
            state.error = null;
          })
          .addCase(thunk.fulfilled, (state) => {
            state.saving = false;
          })
          .addCase(thunk.rejected, (state, action) => {
            state.saving = false;
            state.error = action.payload || 'Error al guardar';
          });
      });

      // Los casos propios de cada recurso van antes que los matchers:
      // Redux Toolkit no admite addCase despues de un addMatcher.
      extraReducers(builder);

      // Bandera de guardado comun a los thunks extra. Se resuelve con
      // matchers para no chocar con los addCase especificos de arriba.
      const extras = Object.values(extraThunks);
      if (extras.length) {
        const matches = (kind) => (action) => extras.some((t) => t[kind].match(action));

        builder
          .addMatcher(matches('pending'), (state) => {
            state.saving = true;
          })
          .addMatcher(matches('fulfilled'), (state) => {
            state.saving = false;
          })
          .addMatcher(matches('rejected'), (state, action) => {
            state.saving = false;
            state.error = action.payload || 'Error en la operacion';
          });
      }
    },
  });

  return {
    reducer: slice.reducer,
    actions: slice.actions,
    thunks: { fetchAll, fetchOne, createItem, updateItem, deleteItem, ...extraThunks },
  };
}
