import mongoose from 'mongoose';
import MedicalHistory from '../models/MedicalHistory.js';
import User from '../models/User.js';

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// @desc    Add medical history record
// @route   POST /api/medical-history
// @access  Private (Doctor, Admin)
const addMedicalHistory = async (req, res) => {
  const { patientId, type, title, description, severity, dateRecorded } =
    req.body;

  if (!patientId || !isValidObjectId(patientId)) {
    res.status(400);
    throw new Error('Valid patientId is required');
  }

  const patient = await User.findById(patientId).select('_id role');
  if (!patient || patient.role !== 'Patient') {
    res.status(404);
    throw new Error('Patient not found');
  }

  const parsedDateRecorded = dateRecorded ? new Date(dateRecorded) : new Date();
  if (Number.isNaN(parsedDateRecorded.getTime())) {
    res.status(400);
    throw new Error('dateRecorded must be a valid date');
  }

  const record = await MedicalHistory.create({
    patient: patientId,
    addedBy: req.user._id,
    type,
    title,
    description,
    severity: severity || 'N/A',
    dateRecorded: parsedDateRecorded,
  });

  if (record) {
    const populated = await MedicalHistory.findById(record._id)
      .populate('patient', 'firstName lastName profileImage')
      .populate('addedBy', 'firstName lastName profileImage');
    res.status(201).json(populated);
  } else {
    res.status(400);
    throw new Error('Invalid data');
  }
};

// @desc    Get medical history
// @route   GET /api/medical-history
// @access  Private
const getMedicalHistory = async (req, res) => {
  const { patientId } = req.query;
  let query = {};

  if (req.user.role === 'Patient') {
    query = { patient: req.user._id };
  } else if (patientId) {
    if (!isValidObjectId(patientId)) {
      res.status(400);
      throw new Error('patientId is invalid');
    }

    const patient = await User.findById(patientId).select('_id role').lean();
    if (!patient || patient.role !== 'Patient') {
      res.status(404);
      throw new Error('Patient not found');
    }

    query = { patient: patientId };
  }

  const records = await MedicalHistory.find(query)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('addedBy', 'firstName lastName profileImage')
    .sort({ createdAt: -1 });

  res.json(records);
};

// @desc    Update medical history record
// @route   PUT /api/medical-history/:id
// @access  Private (Doctor, Admin)
const updateMedicalHistory = async (req, res) => {
  const record = await MedicalHistory.findById(req.params.id);

  if (!record) {
    res.status(404);
    throw new Error('Record not found');
  }

  if (
    req.user.role === 'Doctor' &&
    String(record.addedBy) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Doctors can only update records they added');
  }

  const { type, title, description, severity, isActive, dateRecorded } =
    req.body;

  if (type) record.type = type;
  if (title) record.title = title;
  if (description !== undefined) record.description = description;
  if (severity) record.severity = severity;
  if (isActive !== undefined) record.isActive = isActive;
  if (dateRecorded) record.dateRecorded = dateRecorded;

  await record.save();

  const updated = await MedicalHistory.findById(record._id)
    .populate('patient', 'firstName lastName profileImage')
    .populate('addedBy', 'firstName lastName profileImage');

  res.json(updated);
};

// @desc    Delete medical history record
// @route   DELETE /api/medical-history/:id
// @access  Private (Admin)
const deleteMedicalHistory = async (req, res) => {
  const record = await MedicalHistory.findById(req.params.id);

  if (!record) {
    res.status(404);
    throw new Error('Record not found');
  }

  await record.deleteOne();
  res.json({ message: 'Record removed' });
};

export {
  addMedicalHistory,
  getMedicalHistory,
  updateMedicalHistory,
  deleteMedicalHistory,
};
