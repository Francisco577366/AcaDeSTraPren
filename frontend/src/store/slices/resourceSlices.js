import { createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../api/client';
import { createCrudSlice } from '../createCrudSlice';

/* ------------------------------------------------------------------ */
/* Alumnos                                                             */
/* ------------------------------------------------------------------ */

const fetchProfile = createAsyncThunk('students/profile', async (id, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/students/${id}/profile`);
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

const setPaymentStatus = createAsyncThunk(
  'students/setPaymentStatus',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/students/${id}/payment-status`, payload);
      dispatch(studentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const createCharge = createAsyncThunk(
  'students/createCharge',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/students/${id}/charge`, payload);
      dispatch(studentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const settleStudentDebt = createAsyncThunk(
  'students/settleDebt',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/students/${id}/settle-debt`, payload);
      dispatch(studentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const students = createCrudSlice('students', '/students', {
  initialFilters: { status: '', paymentState: '', periodMonth: '', periodYear: '' },
  extraThunks: { fetchProfile, settleStudentDebt, setPaymentStatus, createCharge },
  extraReducers: (builder) => {
    builder.addCase(fetchProfile.fulfilled, (state, action) => {
      state.profile = action.payload;
    });
  },
});
export const studentThunks = students.thunks;

/* ------------------------------------------------------------------ */
/* Profesores                                                          */
/* ------------------------------------------------------------------ */

const fetchTeacherProfile = createAsyncThunk('teachers/profile', async (id, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/teachers/${id}/profile`);
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const teachers = createCrudSlice('teachers', '/teachers', {
  initialFilters: { status: '', contractType: '' },
  extraThunks: { fetchTeacherProfile },
  extraReducers: (builder) => {
    builder.addCase(fetchTeacherProfile.fulfilled, (state, action) => {
      state.profile = action.payload;
    });
  },
});
export const teacherThunks = teachers.thunks;

/* ------------------------------------------------------------------ */
/* Cobros a los alumnos                                                */
/* ------------------------------------------------------------------ */

const settlePayment = createAsyncThunk(
  'payments/settle',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/payments/${id}/settle`, payload);
      dispatch(paymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const voidPayment = createAsyncThunk(
  'payments/void',
  async ({ id, reason }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/payments/${id}/void`, { reason });
      dispatch(paymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const restorePayment = createAsyncThunk(
  'payments/restore',
  async (id, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/payments/${id}/restore`);
      dispatch(paymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const generateMonthly = createAsyncThunk(
  'payments/generateMonthly',
  async (payload, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post('/payments/generate-monthly', payload);
      dispatch(paymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const fetchPaymentSummary = createAsyncThunk(
  'payments/summary',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/payments/summary', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const payments = createCrudSlice('payments', '/payments', {
  initialFilters: {
    status: '', conceptType: '', studentId: '', periodMonth: '', periodYear: '',
  },
  extraThunks: {
    settlePayment, voidPayment, restorePayment, generateMonthly, fetchPaymentSummary,
  },
  extraReducers: (builder) => {
    builder.addCase(fetchPaymentSummary.fulfilled, (state, action) => {
      state.summary = action.payload;
    });
  },
});
export const paymentThunks = payments.thunks;

/* ------------------------------------------------------------------ */
/* Pagos a profesores                                                  */
/* ------------------------------------------------------------------ */

const settleTeacherPayment = createAsyncThunk(
  'teacherPayments/settle',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/teacher-payments/${id}/settle`, payload);
      dispatch(teacherPaymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const voidTeacherPayment = createAsyncThunk(
  'teacherPayments/void',
  async ({ id, reason }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/teacher-payments/${id}/void`, { reason });
      dispatch(teacherPaymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const generatePayroll = createAsyncThunk(
  'teacherPayments/generatePayroll',
  async (payload, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post('/teacher-payments/generate-payroll', payload);
      dispatch(teacherPaymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const fetchPayrollSummary = createAsyncThunk(
  'teacherPayments/summary',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/teacher-payments/summary', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const teacherPayments = createCrudSlice('teacherPayments', '/teacher-payments', {
  initialFilters: {
    status: '', conceptType: '', teacherId: '', periodMonth: '', periodYear: '',
  },
  extraThunks: {
    settleTeacherPayment, voidTeacherPayment, generatePayroll, fetchPayrollSummary,
  },
  extraReducers: (builder) => {
    builder.addCase(fetchPayrollSummary.fulfilled, (state, action) => {
      state.summary = action.payload;
    });
  },
});
export const teacherPaymentThunks = teacherPayments.thunks;

/* ------------------------------------------------------------------ */
/* Trabajos de alumnos                                                 */
/* ------------------------------------------------------------------ */

const settleWork = createAsyncThunk(
  'works/settle',
  async ({ id, amount }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/works/${id}/settle`, { amount });
      dispatch(workThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const invoiceWork = createAsyncThunk(
  'works/invoice',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/works/${id}/invoice`, payload);
      dispatch(workThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const fetchWorkSummary = createAsyncThunk('works/summary', async (params, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/works/summary', { params });
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const works = createCrudSlice('works', '/works', {
  initialFilters: { status: '', paymentStatus: '', studentId: '', teacherId: '' },
  extraThunks: { settleWork, invoiceWork, fetchWorkSummary },
  extraReducers: (builder) => {
    builder.addCase(fetchWorkSummary.fulfilled, (state, action) => {
      state.summary = action.payload;
    });
  },
});
export const workThunks = works.thunks;

/* ------------------------------------------------------------------ */
/* Libreria: productos                                                 */
/* ------------------------------------------------------------------ */

const fetchInventory = createAsyncThunk('products/inventory', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/library/products/inventory');
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

const adjustStock = createAsyncThunk(
  'products/adjustStock',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/library/products/${id}/stock`, payload);
      dispatch(productThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const products = createCrudSlice('products', '/library/products', {
  initialFilters: { category: '', active: '' },
  extraThunks: { fetchInventory, adjustStock },
  extraReducers: (builder) => {
    builder.addCase(fetchInventory.fulfilled, (state, action) => {
      state.inventory = action.payload;
    });
  },
});
export const productThunks = products.thunks;

/* ------------------------------------------------------------------ */
/* Libreria: ventas                                                    */
/* ------------------------------------------------------------------ */

const settleSale = createAsyncThunk(
  'sales/settle',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/library/sales/${id}/settle`, payload);
      dispatch(saleThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const voidSale = createAsyncThunk(
  'sales/void',
  async ({ id, reason }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/library/sales/${id}/void`, { reason });
      dispatch(saleThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const fetchSalesSummary = createAsyncThunk('sales/summary', async (params, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/library/sales/summary', { params });
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const sales = createCrudSlice('sales', '/library/sales', {
  initialFilters: { status: '', studentId: '', from: '', to: '' },
  extraThunks: { settleSale, voidSale, fetchSalesSummary },
  extraReducers: (builder) => {
    builder.addCase(fetchSalesSummary.fulfilled, (state, action) => {
      state.summary = action.payload;
    });
  },
});
export const saleThunks = sales.thunks;

/* ------------------------------------------------------------------ */
/* Personal de la libreria                                             */
/* ------------------------------------------------------------------ */

const fetchStaffProfile = createAsyncThunk('staff/profile', async (id, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/library/staff/${id}/profile`);
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const staff = createCrudSlice('staff', '/library/staff', {
  initialFilters: { status: '', payType: '' },
  extraThunks: { fetchStaffProfile },
  extraReducers: (builder) => {
    builder.addCase(fetchStaffProfile.fulfilled, (state, action) => {
      state.profile = action.payload;
    });
  },
});
export const staffThunks = staff.thunks;

/* ------------------------------------------------------------------ */
/* Nomina de la libreria                                               */
/* ------------------------------------------------------------------ */

const settleStaffPayment = createAsyncThunk(
  'staffPayments/settle',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/library/payroll/${id}/settle`, payload);
      dispatch(staffPaymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const voidStaffPayment = createAsyncThunk(
  'staffPayments/void',
  async ({ id, reason }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/library/payroll/${id}/void`, { reason });
      dispatch(staffPaymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const generateStaffPayroll = createAsyncThunk(
  'staffPayments/generatePayroll',
  async (payload, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post('/library/payroll/generate-payroll', payload);
      dispatch(staffPaymentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const fetchStaffPayrollSummary = createAsyncThunk(
  'staffPayments/summary',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/library/payroll/summary', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const staffPayments = createCrudSlice('staffPayments', '/library/payroll', {
  initialFilters: {
    status: '', conceptType: '', employeeId: '', periodMonth: '', periodYear: '',
  },
  extraThunks: {
    settleStaffPayment, voidStaffPayment, generateStaffPayroll, fetchStaffPayrollSummary,
  },
  extraReducers: (builder) => {
    builder.addCase(fetchStaffPayrollSummary.fulfilled, (state, action) => {
      state.summary = action.payload;
    });
  },
});
export const staffPaymentThunks = staffPayments.thunks;

/* ------------------------------------------------------------------ */
/* Alquiler del local                                                  */
/* ------------------------------------------------------------------ */

const settleRent = createAsyncThunk(
  'rent/settle',
  async ({ id, ...payload }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/rent/${id}/settle`, payload);
      dispatch(rentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const voidRent = createAsyncThunk(
  'rent/void',
  async ({ id, reason }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/rent/${id}/void`, { reason });
      dispatch(rentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const generateRent = createAsyncThunk(
  'rent/generate',
  async (payload, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post('/rent/generate', payload);
      dispatch(rentThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const fetchRentSummary = createAsyncThunk('rent/summary', async (params, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/rent/summary', { params });
    return data.data;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const rent = createCrudSlice('rent', '/rent', {
  initialFilters: { status: '', currency: '', periodMonth: '', periodYear: '' },
  extraThunks: { settleRent, voidRent, generateRent, fetchRentSummary },
  extraReducers: (builder) => {
    builder.addCase(fetchRentSummary.fulfilled, (state, action) => {
      state.summary = action.payload;
    });
  },
});
export const rentThunks = rent.thunks;

/* ------------------------------------------------------------------ */
/* Pagos personales                                                    */
/* ------------------------------------------------------------------ */

const fetchPersonalSummary = createAsyncThunk(
  'personal/summary',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/personal-payments/summary', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const fetchPreviousPersonal = createAsyncThunk(
  'personal/previous',
  async (params, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/personal-payments/previous', { params });
      return data.data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const renewPersonal = createAsyncThunk(
  'personal/renew',
  async (payload, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post('/personal-payments/renew', payload);
      dispatch(personalThunks.fetchAll());
      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const personal = createCrudSlice('personal', '/personal-payments', {
  initialFilters: { category: '', currency: '', from: '', to: '' },
  extraThunks: { fetchPersonalSummary, fetchPreviousPersonal, renewPersonal },
  extraReducers: (builder) => {
    builder.addCase(fetchPersonalSummary.fulfilled, (state, action) => {
      state.summary = action.payload;
    });
  },
});
export const personalThunks = personal.thunks;
