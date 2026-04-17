import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import LoadingFallback from './components/common/LoadingFallback';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import { SocketProvider } from './context/SocketContext';

// Lazy Load Pages
const Layout = lazy(() => import('./components/layout/Layout'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Patients = lazy(() => import('./pages/Patients'));
const Doctors = lazy(() => import('./pages/Doctors'));
const Appointments = lazy(() => import('./pages/Appointments'));
const Billing = lazy(() => import('./pages/Billing'));
const Pharmacy = lazy(() => import('./pages/Pharmacy'));
const MedicalRecords = lazy(() => import('./pages/MedicalRecords'));
const Prescriptions = lazy(() => import('./pages/Prescriptions'));
const Settings = lazy(() => import('./pages/Settings'));
const LabReports = lazy(() => import('./pages/LabReports'));
const Reports = lazy(() => import('./pages/Reports'));
const BedManagement = lazy(() => import('./pages/BedManagement'));
const DoctorSchedule = lazy(() => import('./pages/DoctorSchedule'));
const Notifications = lazy(() => import('./pages/Notifications'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const InventoryAlerts = lazy(() => import('./pages/InventoryAlerts'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Leaves = lazy(() => import('./pages/Leaves'));
const Chat = lazy(() => import('./pages/Chat'));
const QrPatientDetails = lazy(() => import('./pages/QrPatientDetails'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));

const STAFF_ROLES = ['Admin', 'Doctor', 'Receptionist', 'Pharmacist'];
const CLINICAL_ROLES = ['Admin', 'Doctor', 'Receptionist'];
const PATIENT_DATA_ROLES = ['Admin', 'Doctor', 'Receptionist', 'Pharmacist'];
const APPOINTMENT_ROLES = ['Admin', 'Doctor', 'Receptionist', 'Patient'];
const BILLING_ROLES = ['Admin', 'Receptionist', 'Pharmacist', 'Patient'];
const MEDICAL_RECORD_ROLES = ['Admin', 'Doctor', 'Patient'];
const PRESCRIPTION_ROLES = ['Admin', 'Doctor', 'Pharmacist', 'Patient'];
const LAB_REPORT_ROLES = ['Admin', 'Doctor', 'Patient'];

function App() {
  const { user } = useAuth();
  const { darkMode } = useTheme();

  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route
            path="/login"
            element={!user ? <Login /> : <Navigate to="/dashboard" />}
          />
          <Route
            path="/register"
            element={!user ? <Register /> : <Navigate to="/dashboard" />}
          />
          <Route path="/qr-patient/:patientId" element={<QrPatientDetails />} />

          {/* Protected Routes */}
          <Route
            element={
              <SocketProvider>
                <ProtectedRoute />
              </SocketProvider>
            }
          >
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route
                element={<ProtectedRoute allowedRoles={PATIENT_DATA_ROLES} />}
              >
                <Route path="/patients" element={<Patients />} />
              </Route>
              <Route path="/doctors" element={<Doctors />} />

              <Route
                element={<ProtectedRoute allowedRoles={APPOINTMENT_ROLES} />}
              >
                <Route path="/appointments" element={<Appointments />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={BILLING_ROLES} />}>
                <Route path="/billing" element={<Billing />} />
                <Route path="/bills" element={<Billing />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute allowedRoles={['Admin', 'Pharmacist']} />
                }
              >
                <Route path="/pharmacy" element={<Pharmacy />} />
              </Route>

              <Route
                element={<ProtectedRoute allowedRoles={MEDICAL_RECORD_ROLES} />}
              >
                <Route path="/records" element={<MedicalRecords />} />
              </Route>

              <Route
                element={<ProtectedRoute allowedRoles={PRESCRIPTION_ROLES} />}
              >
                <Route path="/prescriptions" element={<Prescriptions />} />
              </Route>

              <Route path="/settings" element={<Settings />} />

              <Route
                element={<ProtectedRoute allowedRoles={LAB_REPORT_ROLES} />}
              >
                <Route path="/lab-reports" element={<LabReports />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
                <Route path="/reports" element={<Reports />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={CLINICAL_ROLES} />}>
                <Route path="/beds" element={<BedManagement />} />
                <Route path="/schedule" element={<DoctorSchedule />} />
              </Route>

              <Route path="/notifications" element={<Notifications />} />

              <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
                <Route path="/activity-log" element={<ActivityLog />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute allowedRoles={['Admin', 'Pharmacist']} />
                }
              >
                <Route path="/inventory-alerts" element={<InventoryAlerts />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={STAFF_ROLES} />}>
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/leaves" element={<Leaves />} />
              </Route>

              <Route path="/chat" element={<Chat />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="/" element={<Navigate to="/dashboard" />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Suspense>
      <ToastContainer
        position="top-right"
        theme={darkMode ? 'dark' : 'light'}
      />
    </>
  );
}

export default App;
