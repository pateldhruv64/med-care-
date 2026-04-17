import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Clock3,
  FlaskConical,
  HeartPulse,
  Pill,
  ShieldCheck,
  User,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import api from '../utils/axiosConfig';

const inFlightQrDetailRequests = new Map();

const readTokenFromUrl = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const hashValue = window.location.hash?.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash || '';
  const hashParams = new URLSearchParams(hashValue);
  const hashToken = hashParams.get('token');

  if (hashToken) {
    return hashToken;
  }

  const searchParams = new URLSearchParams(window.location.search || '');
  return searchParams.get('token') || '';
};

const clearTokenFromBrowserUrl = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete('token');
  currentUrl.hash = '';

  window.history.replaceState(
    {},
    document.title,
    `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
  );
};

const statusBadgeClasses = {
  'Pending': 'bg-yellow-100 text-yellow-700',
  'Confirmed': 'bg-green-100 text-green-700',
  'Completed': 'bg-blue-100 text-blue-700',
  'Cancelled': 'bg-red-100 text-red-700',
  'Ordered': 'bg-orange-100 text-orange-700',
  'In Progress': 'bg-indigo-100 text-indigo-700',
};

const getFriendlyError = (error) => {
  const status = error?.response?.status;
  const message = error?.response?.data?.message;

  if (status === 410) {
    return message || 'This QR link has expired or has already been used.';
  }

  if (status === 404) {
    return (
      message ||
      'Invalid QR link. Please request a new code from hospital staff.'
    );
  }

  if (status === 400) {
    return message || 'Missing QR token. Please rescan the code.';
  }

  return message || 'Unable to load patient details right now.';
};

const formatDate = (value, withTime = false) => {
  if (!value) return 'N/A';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';

  return withTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
};

const SectionCard = ({ title, icon: Icon, children }) => (
  <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
      <Icon size={18} className="text-cyan-600" />
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const EmptyState = ({ text }) => (
  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500 text-sm">
    {text}
  </div>
);

const QrPatientDetails = () => {
  const { patientId } = useParams();
  const token = useMemo(() => readTokenFromUrl(), [patientId]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let isActive = true;

    const fetchDetails = async () => {
      if (!token) {
        if (isActive) {
          setPayload(null);
          setErrorMessage(
            'QR token missing. Please scan the latest QR code again.',
          );
          setLoading(false);
        }
        return;
      }

      try {
        if (isActive) {
          setLoading(true);
          setErrorMessage('');
        }

        clearTokenFromBrowserUrl();

        const requestKey = `${patientId}:${token}`;

        let requestPromise = inFlightQrDetailRequests.get(requestKey);

        if (!requestPromise) {
          requestPromise = api
            .post(`/qr-share/patients/${patientId}/details`, { token })
            .then((response) => response.data)
            .finally(() => {
              inFlightQrDetailRequests.delete(requestKey);
            });

          inFlightQrDetailRequests.set(requestKey, requestPromise);
        }

        const data = await requestPromise;

        if (!isActive) {
          return;
        }

        setPayload(data);
        setErrorMessage('');
      } catch (error) {
        if (isActive) {
          setPayload(null);
          setErrorMessage(getFriendlyError(error));
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      isActive = false;
    };
  }, [patientId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-8 py-10 text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-slate-300 border-t-cyan-500 animate-spin" />
          <p className="mt-4 text-slate-600 font-medium">
            Loading secure patient details...
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Please wait, token is being validated.
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white border border-red-100 rounded-xl shadow-sm p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-500 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold text-slate-800">
                Unable to open this QR link
              </h1>
              <p className="text-sm text-slate-600 mt-1">{errorMessage}</p>
              <p className="text-xs text-slate-500 mt-3">
                Ask hospital staff to generate a new secure QR code.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!payload) {
    return null;
  }

  const {
    patient,
    medicalHistory,
    prescriptions,
    labReports,
    appointments,
    meta,
  } = payload;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 md:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto space-y-6"
      >
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-cyan-100 text-cyan-700 font-bold flex items-center justify-center text-lg overflow-hidden">
                {patient.profileImage ? (
                  <img
                    src={patient.profileImage}
                    alt="Patient"
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  `${patient.firstName?.[0] || ''}${patient.lastName?.[0] || ''}`
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">
                  {patient.firstName} {patient.lastName}
                </h1>
                <p className="text-sm text-slate-500">
                  Patient ID: {patient.patientId || patient._id}
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-100">
              <ShieldCheck size={16} />
              Secure one-time access validated
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Token consumed at {formatDate(meta?.consumedAt, true)} • Max{' '}
            {meta?.sectionLimit || 20} latest records per section
          </p>
        </div>

        <SectionCard title="Basic Profile" icon={User}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Email Address</p>
              <p className="font-medium text-slate-800">
                {patient.email || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Phone Number</p>
              <p className="font-medium text-slate-800">
                {patient.phone || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Gender</p>
              <p className="font-medium text-slate-800">
                {patient.gender || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Date of Birth</p>
              <p className="font-medium text-slate-800">
                {formatDate(patient.dateOfBirth)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Registered On</p>
              <p className="font-medium text-slate-800">
                {formatDate(patient.createdAt)}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Medical History" icon={HeartPulse}>
          {medicalHistory.length === 0 ? (
            <EmptyState text="No medical history records available." />
          ) : (
            <div className="space-y-3">
              {medicalHistory.map((record) => (
                <div
                  key={record._id}
                  className="border border-slate-100 rounded-lg p-4 bg-slate-50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800">
                      {record.title}
                    </p>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-xs font-medium">
                      {record.type}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-medium">
                      {record.severity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2">
                    {record.description || 'No description provided.'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Recorded on {formatDate(record.dateRecorded)}
                    {record.addedBy?.firstName
                      ? ` • By Dr. ${record.addedBy.firstName} ${record.addedBy.lastName}`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Prescriptions" icon={Pill}>
          {prescriptions.length === 0 ? (
            <EmptyState text="No prescriptions available." />
          ) : (
            <div className="space-y-4">
              {prescriptions.map((prescription) => (
                <div
                  key={prescription._id}
                  className="border border-slate-100 rounded-lg p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <p className="font-semibold text-slate-800">
                      Diagnosis: {prescription.diagnosis}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(prescription.createdAt)}
                      {prescription.doctor?.firstName
                        ? ` • Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName}`
                        : ''}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {prescription.medicines?.length ? (
                      prescription.medicines.map((medicine, index) => (
                        <span
                          key={`${prescription._id}-${index}`}
                          className="px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 text-xs font-medium"
                        >
                          {medicine.name} • {medicine.dosage} •{' '}
                          {medicine.duration}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">
                        No medicines listed.
                      </span>
                    )}
                  </div>
                  {prescription.notes && (
                    <p className="text-sm text-slate-600 mt-3">
                      Notes: {prescription.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Lab Reports" icon={FlaskConical}>
          {labReports.length === 0 ? (
            <EmptyState text="No lab reports available." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-slate-600">
                      Test
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-600">
                      Category
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-600">
                      Status
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-600">
                      Doctor
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-600">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labReports.map((report) => (
                    <tr key={report._id}>
                      <td className="px-3 py-3 text-slate-800">
                        {report.testName}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {report.testCategory}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClasses[report.status] || 'bg-slate-100 text-slate-700'}`}
                        >
                          {report.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {report.doctor?.firstName
                          ? `Dr. ${report.doctor.firstName} ${report.doctor.lastName}`
                          : 'N/A'}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatDate(report.completedAt || report.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Appointments Summary" icon={Clock3}>
          {appointments.length === 0 ? (
            <EmptyState text="No appointments available." />
          ) : (
            <div className="space-y-3">
              {appointments.map((appointment) => (
                <div
                  key={appointment._id}
                  className="border border-slate-100 rounded-lg p-4 bg-slate-50"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <p className="font-semibold text-slate-800">
                      {appointment.doctor?.firstName
                        ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
                        : 'Doctor not assigned'}
                    </p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusBadgeClasses[appointment.status] || 'bg-slate-100 text-slate-700'}`}
                    >
                      {appointment.status}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 mt-2 space-y-1">
                    <p className="inline-flex items-center gap-1">
                      <Calendar size={14} />{' '}
                      {formatDate(appointment.appointmentDate, true)}
                    </p>
                    <p>
                      <span className="font-medium">Reason:</span>{' '}
                      {appointment.reason}
                    </p>
                    {appointment.doctor?.doctorDepartment && (
                      <p>
                        <span className="font-medium">Department:</span>{' '}
                        {appointment.doctor.doctorDepartment}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </motion.div>
    </div>
  );
};

export default QrPatientDetails;
