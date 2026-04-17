import crypto from 'crypto';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import MedicalHistory from '../models/MedicalHistory.js';
import Prescription from '../models/Prescription.js';
import LabReport from '../models/LabReport.js';
import QrShareToken from '../models/QrShareToken.js';
import logActivity from '../utils/logActivity.js';

const DEFAULT_QR_TOKEN_TTL_MINUTES = 15;
const SECTION_RESULT_LIMIT = 20;

const normalizeBaseUrl = (url = '') => url.trim().replace(/\/+$/, '');

const getQrTokenTtlMinutes = () => {
  const rawTtl = Number.parseInt(process.env.QR_TOKEN_TTL_MINUTES, 10);
  if (Number.isNaN(rawTtl) || rawTtl <= 0) {
    return DEFAULT_QR_TOKEN_TTL_MINUTES;
  }

  return rawTtl;
};

const getQrPublicBaseUrl = () => {
  const configuredUrl =
    process.env.QR_PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173';
  return normalizeBaseUrl(configuredUrl);
};

const hashQrToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// @desc    Generate a secure QR share link for a patient
// @route   POST /api/qr-share/patients/:patientId/link
// @access  Private (Admin, Doctor, Receptionist, Pharmacist)
const generatePatientQrShareLink = async (req, res) => {
  const { patientId } = req.params;

  const patient = await User.findById(patientId).select(
    'firstName lastName role',
  );
  if (!patient || patient.role !== 'Patient') {
    res.status(404);
    throw new Error('Patient not found');
  }

  const tokenTtlMinutes = getQrTokenTtlMinutes();
  const expiresAt = new Date(Date.now() + tokenTtlMinutes * 60 * 1000);

  // Invalidate previous active tokens for this patient for stricter security.
  await QrShareToken.updateMany(
    {
      patient: patient._id,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: { expiresAt: new Date() },
    },
  );

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashQrToken(rawToken);

  await QrShareToken.create({
    patient: patient._id,
    createdBy: req.user._id,
    tokenHash,
    expiresAt,
  });

  const shareUrl = `${getQrPublicBaseUrl()}/qr-patient/${patient._id}?token=${rawToken}`;

  await logActivity({
    userId: req.user._id,
    action: 'CREATE',
    entity: 'Patient',
    entityId: patient._id,
    details: `Generated secure QR share link for patient ${patient.firstName} ${patient.lastName}`,
    ipAddress: req.ip,
  });

  res.status(201).json({
    patientId: patient._id,
    shareUrl,
    expiresAt,
    ttlMinutes: tokenTtlMinutes,
    singleUse: true,
  });
};

// @desc    Resolve a secure QR share link and return patient details
// @route   GET /api/qr-share/patients/:patientId/details?token=<token>
// @access  Public (token-based)
const resolvePatientQrShareDetails = async (req, res) => {
  const { patientId } = req.params;
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400);
    throw new Error('QR token is required');
  }

  const patient = await User.findById(patientId)
    .select(
      'firstName lastName email phone gender dateOfBirth profileImage patientId createdAt role',
    )
    .lean();

  if (!patient || patient.role !== 'Patient') {
    res.status(404);
    throw new Error('Patient not found');
  }

  const now = new Date();
  const tokenHash = hashQrToken(token);

  const consumedToken = await QrShareToken.findOneAndUpdate(
    {
      patient: patientId,
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        usedAt: now,
        usedByIp: req.ip || '',
        usedByUserAgent: req.get('user-agent') || '',
      },
    },
    { new: true },
  );

  if (!consumedToken) {
    const existingToken = await QrShareToken.findOne({
      patient: patientId,
      tokenHash,
    }).lean();

    if (!existingToken) {
      res.status(404);
      throw new Error('Invalid QR link');
    }

    if (existingToken.usedAt) {
      res.status(410);
      throw new Error('This QR link has already been used');
    }

    if (existingToken.expiresAt <= now) {
      res.status(410);
      throw new Error('This QR link has expired');
    }

    res.status(409);
    throw new Error(
      'Unable to validate QR link. Please generate a new QR code.',
    );
  }

  const [medicalHistory, prescriptions, labReports, appointments] =
    await Promise.all([
      MedicalHistory.find({ patient: patientId })
        .populate('addedBy', 'firstName lastName')
        .sort({ dateRecorded: -1 })
        .limit(SECTION_RESULT_LIMIT)
        .lean(),
      Prescription.find({ patient: patientId })
        .populate('doctor', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(SECTION_RESULT_LIMIT)
        .lean(),
      LabReport.find({ patient: patientId })
        .populate('doctor', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(SECTION_RESULT_LIMIT)
        .lean(),
      Appointment.find({ patient: patientId })
        .populate('doctor', 'firstName lastName doctorDepartment')
        .sort({ appointmentDate: -1 })
        .limit(SECTION_RESULT_LIMIT)
        .lean(),
    ]);

  res.json({
    patient: {
      _id: patient._id,
      patientId: patient.patientId || null,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email || '',
      phone: patient.phone || '',
      gender: patient.gender || 'N/A',
      dateOfBirth: patient.dateOfBirth || null,
      profileImage: patient.profileImage || '',
      createdAt: patient.createdAt,
    },
    medicalHistory: medicalHistory.map((record) => ({
      _id: record._id,
      type: record.type,
      title: record.title,
      description: record.description,
      severity: record.severity,
      dateRecorded: record.dateRecorded,
      isActive: record.isActive,
      addedBy: record.addedBy
        ? {
            firstName: record.addedBy.firstName,
            lastName: record.addedBy.lastName,
          }
        : null,
    })),
    prescriptions: prescriptions.map((prescription) => ({
      _id: prescription._id,
      diagnosis: prescription.diagnosis,
      medicines: prescription.medicines,
      notes: prescription.notes,
      createdAt: prescription.createdAt,
      doctor: prescription.doctor
        ? {
            firstName: prescription.doctor.firstName,
            lastName: prescription.doctor.lastName,
          }
        : null,
    })),
    labReports: labReports.map((report) => ({
      _id: report._id,
      testName: report.testName,
      testCategory: report.testCategory,
      status: report.status,
      results: report.results,
      notes: report.notes,
      createdAt: report.createdAt,
      completedAt: report.completedAt,
      doctor: report.doctor
        ? {
            firstName: report.doctor.firstName,
            lastName: report.doctor.lastName,
          }
        : null,
    })),
    appointments: appointments.map((appointment) => ({
      _id: appointment._id,
      appointmentDate: appointment.appointmentDate,
      reason: appointment.reason,
      status: appointment.status,
      notes: appointment.notes,
      createdAt: appointment.createdAt,
      doctor: appointment.doctor
        ? {
            firstName: appointment.doctor.firstName,
            lastName: appointment.doctor.lastName,
            doctorDepartment: appointment.doctor.doctorDepartment,
          }
        : null,
    })),
    meta: {
      singleUse: true,
      consumedAt: consumedToken.usedAt,
      sectionLimit: SECTION_RESULT_LIMIT,
    },
  });
};

export { generatePatientQrShareLink, resolvePatientQrShareDetails };
