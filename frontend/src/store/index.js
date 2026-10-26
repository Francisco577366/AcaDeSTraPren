import { configureStore } from '@reduxjs/toolkit';

import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import dashboardReducer from './slices/dashboardSlice';
import activityReducer from './slices/activitySlice';
import optionsReducer from './slices/optionsSlice';
import periodReducer from './slices/periodSlice';
import {
  students,
  teachers,
  payments,
  teacherPayments,
  works,
  products,
  sales,
  staff,
  staffPayments,
  rent,
  personal,
} from './slices/resourceSlices';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    dashboard: dashboardReducer,
    activity: activityReducer,
    options: optionsReducer,
    period: periodReducer,
    students: students.reducer,
    teachers: teachers.reducer,
    payments: payments.reducer,
    teacherPayments: teacherPayments.reducer,
    works: works.reducer,
    products: products.reducer,
    sales: sales.reducer,
    staff: staff.reducer,
    staffPayments: staffPayments.reducer,
    rent: rent.reducer,
    personal: personal.reducer,
  },
  middleware: (getDefault) =>
    getDefault({
      // Las fechas viajan como string, no necesitamos el chequeo estricto.
      serializableCheck: false,
    }),
});

export const resourceActions = {
  students: students.actions,
  teachers: teachers.actions,
  payments: payments.actions,
  teacherPayments: teacherPayments.actions,
  works: works.actions,
  products: products.actions,
  sales: sales.actions,
  staff: staff.actions,
  staffPayments: staffPayments.actions,
  rent: rent.actions,
  personal: personal.actions,
};
