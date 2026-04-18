import mongoose from 'mongoose';
import Prescription from '../models/Prescription.js';
import Appointment from '../models/Appointment.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import logActivity from '../utils/logActivity.js';

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// @desc    Create new prescription
// @route   POST /api/prescriptions
// @access  Private (Doctor)
const createPrescription = async (req, res) => {
  const { patientId, appointmentId, diagnosis, medicines, notes } = req.body;

  if (!patientId || !isValidObjectId(patientId)) {
    res.status(400);
    throw new Error('Valid patientId is required');
  }

  if (!appointmentId || !isValidObjectId(appointmentId)) {
    res.status(400);
    throw new Error('Valid appointmentId is required');
  }

  const normalizedDiagnosis = String(diagnosis || '').trim();
  if (!normalizedDiagnosis) {
    res.status(400);
    throw new Error('Diagnosis is required');
  }

  if (!Array.isArray(medicines) || medicines.length === 0) {
    res.status(400);
    throw new Error('No medicines prescribed');
  }

  const normalizedMedicines = medicines.map((medicine, index) => {
    const name = String(medicine?.name || '').trim();
    const dosage = String(medicine?.dosage || '').trim();
    const duration = String(medicine?.duration || '').trim();
    const instructions = String(medicine?.instructions || '').trim();

    if (!name || !dosage || !duration) {
      res.status(400);
      throw new Error(
        `Medicine name, dosage, and duration are required for row ${index + 1}`,
      );
    }

    return {
      name,
      dosage,
      duration,
      instructions,
    };
  });

  const patient = await User.findById(patientId).select('_id role').lean();
  if (!patient || patient.role !== 'Patient') {
    res.status(404);
    throw new Error('Patient not found');
  }

  const appointment = await Appointment.findById(appointmentId)
    .select('patient doctor status')
    .lean();

  if (!appointment) {
    res.status(404);
    throw new Error('Appointment not found');
  }

  if (String(appointment.patient) !== String(patientId)) {
    res.status(400);
    throw new Error('Appointment does not belong to the selected patient');
  }

  if (String(appointment.doctor) !== String(req.user._id)) {
    res.status(403);
    throw new Error('You can only prescribe for your own appointments');
  }

  const existingPrescription = await Prescription.findOne({
    appointment: appointmentId,
  })
    .select('_id')
    .lean();
  if (existingPrescription) {
    res.status(409);
    throw new Error('A prescription already exists for this appointment');
  }

  const session = await mongoose.startSession();
  let prescription;

  try {
    session.startTransaction();

    const [prescriptionDoc] = await Prescription.create(
      [
        {
          doctor: req.user._id,
          patient: patientId,
          appointment: appointmentId,
          diagnosis: normalizedDiagnosis,
          medicines: normalizedMedicines,
          notes: notes ? String(notes).trim() : '',
        },
      ],
      { session },
    );

    prescription = prescriptionDoc;

    await Appointment.updateOne(
      { _id: appointmentId },
      { $set: { status: 'Completed' } },
      { session },
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  if (prescription) {
    // Notify patient about new prescription
    try {
      await Notification.create({
        user: patientId,
        title: 'New Prescription',
        message: `Dr. ${req.user.firstName} prescribed medicines for: ${normalizedDiagnosis}`,
        type: 'prescription',
        link: '/records',
      });

      // Notify patient via socket
      req.io.to(`user:${String(patientId)}`).emit('new_notification', {
        message: `Dr. ${req.user.firstName} prescribed medicines for: ${normalizedDiagnosis}`,
        type: 'prescription',
      });

      // START: Real-time list update
      const fullPrescription = await Prescription.findById(prescription._id)
        .populate('doctor', 'firstName lastName profileImage')
        .populate('patient', 'firstName lastName profileImage');

      // Notify patient AND doctor (if they are on different devices/views)
      req.io
        .to(`user:${String(patientId)}`)
        .emit('prescription_created', fullPrescription);
      req.io
        .to(`user:${req.user._id.toString()}`)
        .emit('prescription_created', fullPrescription);
      // END: Real-time list update
    } catch (e) {
      /* ignore */
    }

    await logActivity({
      userId: req.user._id,
      action: 'CREATE',
      entity: 'Prescription',
      entityId: prescription._id,
      details: `Prescription created: ${normalizedDiagnosis}`,
      ipAddress: req.ip,
    });

    res.status(201).json(prescription);
  } else {
    res.status(400);
    throw new Error('Invalid prescription data');
  }
};

// @desc    Get prescriptions
// @route   GET /api/prescriptions
// @access  Private
const getPrescriptions = async (req, res) => {
  let query = {};

  if (req.user.role === 'Doctor') {
    query = { doctor: req.user._id };
  } else if (req.user.role === 'Patient') {
    query = { patient: req.user._id };
  }

  const prescriptions = await Prescription.find(query)
    .populate('doctor', 'firstName lastName profileImage')
    .populate('patient', 'firstName lastName profileImage')
    .sort({ createdAt: -1 });

  res.json(prescriptions);
};

export { createPrescription, getPrescriptions };
