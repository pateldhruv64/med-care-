import mongoose from 'mongoose';
import LabReport from '../models/LabReport.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import logActivity from '../utils/logActivity.js';

const ALLOWED_LAB_STATUSES = new Set(['Ordered', 'In Progress', 'Completed']);
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// @desc    Create a lab report (Order a test)
// @route   POST /api/lab-reports
// @access  Private (Doctor, Admin)
const createLabReport = async (req, res) => {
  const { patientId, doctorId, testName, testCategory, notes } = req.body;

  if (!patientId || !isValidObjectId(patientId)) {
    res.status(400);
    throw new Error('Valid patientId is required');
  }

  const normalizedTestName = String(testName || '').trim();
  if (!normalizedTestName) {
    res.status(400);
    throw new Error('testName is required');
  }

  const patient = await User.findById(patientId).select('_id role').lean();
  if (!patient || patient.role !== 'Patient') {
    res.status(404);
    throw new Error('Patient not found');
  }

  let assignedDoctorId = req.user._id;
  if (req.user.role === 'Admin') {
    if (!doctorId || !isValidObjectId(doctorId)) {
      res.status(400);
      throw new Error(
        'Admin must provide a valid doctorId while ordering a lab report',
      );
    }

    const doctor = await User.findById(doctorId).select('_id role').lean();
    if (!doctor || doctor.role !== 'Doctor') {
      res.status(404);
      throw new Error('Doctor not found');
    }

    assignedDoctorId = doctor._id;
  }

  const report = await LabReport.create({
    patient: patientId,
    doctor: assignedDoctorId,
    testName: normalizedTestName,
    testCategory: testCategory || 'Blood Test',
    notes: notes ? String(notes).trim() : '',
    orderedBy: req.user._id,
  });

  if (report) {
    // Notify patient about lab test ordered
    try {
      await Notification.create({
        user: patientId,
        title: 'Lab Test Ordered',
        message: `A ${normalizedTestName} test has been ordered for you`,
        type: 'lab_report',
        link: '/lab-reports',
      });

      // Notify patient via socket
      req.io.to(`user:${String(patientId)}`).emit('new_notification', {
        message: `A ${normalizedTestName} test has been ordered for you`,
        type: 'lab_report',
      });

      // START: Real-time list update
      const fullReport = await LabReport.findById(report._id)
        .populate('patient', 'firstName lastName email profileImage')
        .populate('doctor', 'firstName lastName profileImage')
        .populate('orderedBy', 'firstName lastName profileImage');

      const realtimeTargets = new Set([
        String(patientId),
        String(assignedDoctorId),
        String(req.user._id),
      ]);

      for (const targetUserId of realtimeTargets) {
        req.io
          .to(`user:${targetUserId}`)
          .emit('lab_report_updated', fullReport);
      }
      // END: Real-time list update
    } catch (e) {
      /* ignore */
    }

    await logActivity({
      userId: req.user._id,
      action: 'CREATE',
      entity: 'LabReport',
      entityId: report._id,
      details: `Lab test ordered: ${normalizedTestName}`,
      ipAddress: req.ip,
    });

    res.status(201).json(report);
  } else {
    res.status(400);
    throw new Error('Invalid lab report data');
  }
};

// @desc    Get all lab reports
// @route   GET /api/lab-reports
// @access  Private
const getLabReports = async (req, res) => {
  let query = {};
  if (req.user.role === 'Patient') {
    query = { patient: req.user._id };
  } else if (req.user.role === 'Doctor') {
    query = { doctor: req.user._id };
  }

  const reports = await LabReport.find(query)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('doctor', 'firstName lastName profileImage')
    .populate('orderedBy', 'firstName lastName profileImage')
    .sort({ createdAt: -1 });

  res.json(reports);
};

// @desc    Update lab report (add results / change status)
// @route   PUT /api/lab-reports/:id
// @access  Private (Doctor, Admin)
const updateLabReport = async (req, res) => {
  const report = await LabReport.findById(req.params.id);

  if (!report) {
    res.status(404);
    throw new Error('Lab report not found');
  }

  if (
    req.user.role === 'Doctor' &&
    String(report.doctor) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('You can only update lab reports assigned to you');
  }

  const { status, results, notes } = req.body;

  if (status) {
    if (!ALLOWED_LAB_STATUSES.has(status)) {
      res.status(400);
      throw new Error('Invalid lab report status');
    }
    report.status = status;
  }

  if (results !== undefined) report.results = String(results || '').trim();
  if (notes !== undefined) report.notes = String(notes || '').trim();

  if (status === 'Completed' && !report.results) {
    res.status(400);
    throw new Error(
      'Results are required before marking a lab report as completed',
    );
  }

  if (status === 'Completed') {
    report.completedAt = new Date();
    // Notify patient that results are ready
    try {
      await Notification.create({
        user: report.patient,
        title: 'Lab Results Ready',
        message: `Your ${report.testName} results are ready`,
        type: 'lab_report',
        link: '/lab-reports',
      });

      // Notify patient via socket
      req.io.to(`user:${report.patient.toString()}`).emit('new_notification', {
        message: `Your ${report.testName} results are ready`,
        type: 'lab_report',
      });
    } catch (e) {
      /* ignore */
    }

    // START: Real-time list update (Outside try/catch to ensure it runs)
    const fullReport = await LabReport.findById(report._id)
      .populate('patient', 'firstName lastName email profileImage')
      .populate('doctor', 'firstName lastName profileImage');

    req.io
      .to(`user:${report.patient.toString()}`)
      .emit('lab_report_updated', fullReport);
    if (report.doctor)
      req.io
        .to(`user:${report.doctor.toString()}`)
        .emit('lab_report_updated', fullReport);
    // END: Real-time list update
  }

  await report.save();

  await logActivity({
    userId: req.user._id,
    action: status ? 'STATUS_CHANGE' : 'UPDATE',
    entity: 'LabReport',
    entityId: report._id,
    details: `Lab report updated: ${report.testName}${status ? ` → ${status}` : ''}`,
    ipAddress: req.ip,
  });

  const updated = await LabReport.findById(report._id)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('doctor', 'firstName lastName profileImage');

  res.json(updated);
};

// @desc    Delete a lab report
// @route   DELETE /api/lab-reports/:id
// @access  Private (Admin)
const deleteLabReport = async (req, res) => {
  const report = await LabReport.findById(req.params.id);

  if (!report) {
    res.status(404);
    throw new Error('Lab report not found');
  }

  await logActivity({
    userId: req.user._id,
    action: 'DELETE',
    entity: 'LabReport',
    entityId: report._id,
    details: `Lab report deleted: ${report.testName}`,
    ipAddress: req.ip,
  });

  await report.deleteOne();
  res.json({ message: 'Lab report removed' });
};

export { createLabReport, getLabReports, updateLabReport, deleteLabReport };
