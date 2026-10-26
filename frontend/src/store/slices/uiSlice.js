import { createSlice } from '@reduxjs/toolkit';

let counter = 0;

const slice = createSlice({
  name: 'ui',
  initialState: {
    toasts: [],
    sidebarOpen: false,
  },
  reducers: {
    // El payload puede ser un string o { message, type }.
    pushToast: {
      reducer(state, action) {
        state.toasts.push(action.payload);
      },
      prepare(payload) {
        counter += 1;
        const { message, type = 'success' } =
          typeof payload === 'string' ? { message: payload } : payload;
        return { payload: { id: counter, message, type } };
      },
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    toggleSidebar(state, action) {
      state.sidebarOpen = action.payload ?? !state.sidebarOpen;
    },
  },
});

export const { pushToast, dismissToast, toggleSidebar } = slice.actions;
export default slice.reducer;
