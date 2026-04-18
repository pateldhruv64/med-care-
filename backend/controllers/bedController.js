import mongoose from 'mongoose';
import Bed from '../models/Bed.js';
import Invoice from '../models/Invoice.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import logActivity from '../utils/logActivity.js';

const BED_REALTIME_ROLE_ROOMS = [
  'role:Admin',
  'role:Receptionist',
  'role:Doctor',
];

const BILLING_ROLE_ROOMS = [
  'role:Admin',
  'role:Receptionist',
  'role:Pharmacist',
];

const emitToRoleRooms = (io, rooms, eventName, payload) => {
  let emitter = io;
  for (const room of rooms) {
    emitter = emitter.to(room);
  }
  emitter.emit(eventName, payload);
};

const emitBedUpdated = (io, payload) => {
  emitToRoleRooms(io, BED_REALTIME_ROLE_ROOMS, 'bed_updated', payload);
};

const emitInvoiceUpdated = (io, patientId, payload) => {
  let emitter = io.to(`user:${String(patientId)}`);
  for (const room of BILLING_ROLE_ROOMS) {
    emitter = emitter.to(room);
  }
  emitter.emit('invoice_updated', payload);
};

// @desc    Get all beds
// @route   GET /api/beds
const getBeds = async (req, res) => {
  const beds = await Bed.find()
    .populate('patient', 'firstName lastName email profileImage')
    .populate('assignedBy', 'firstName lastName profileImage')
    .sort({ ward: 1, roomNumber: 1, bedNumber: 1 });
  res.json(beds);
};

// @desc    Add a new bed
// @route   POST /api/beds
const addBed = async (req, res) => {
  const { roomNumber, bedNumber, ward, dailyRate, notes } = req.body;

  const exists = await Bed.findOne({ roomNumber, bedNumber });
  if (exists) {
    res.status(400);
    throw new Error('Bed already exists in this room');
  }

  const bed = await Bed.create({
    roomNumber,
    bedNumber,
    ward,
    dailyRate,
    notes,
  });

  await logActivity({
    userId: req.user._id,
    action: 'CREATE',
    entity: 'Bed',
    entityId: bed._id,
    details: `Bed added: Room ${roomNumber}, Bed ${bedNumber} (${ward} Ward)`,
    ipAddress: req.ip,
  });

  // Real-time update - Broadcast to all staff managing beds
  emitBedUpdated(req.io, bed);

  res.status(201).json(bed);
};

// @desc    Assign patient to bed
// @route   PUT /api/beds/:id/assign
const assignBed = async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) {
    res.status(404);
    throw new Error('Bed not found');
  }

  const { patientId } = req.body;

  if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
    res.status(400);
    throw new Error('Valid patientId is required');
  }

  if (bed.status !== 'Available') {
    res.status(400);
    throw new Error('Only available beds can be assigned');
  }

  const patient = await User.findById(patientId).select('_id role');
  if (!patient || patient.role !== 'Patient') {
    res.status(404);
    throw new Error('Patient not found');
  }

  bed.patient = patientId;
  bed.assignedBy = req.user._id;
  bed.status = 'Occupied';
  bed.admissionDate = new Date();
  bed.dischargeDate = null;

  await bed.save();
  const updated = await Bed.findById(bed._id)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('assignedBy', 'firstName lastName profileImage');

  // Notify patient about bed assignment
  try {
    await Notification.create({
      user: patientId,
      title: 'Bed Assigned',
      message: `You have been assigned to Room ${bed.roomNumber}, Bed ${bed.bedNumber} (${bed.ward} Ward)`,
      type: 'bed',
      link: '/appointments',
    });

    // Notify patient via socket
    req.io.to(`user:${String(patientId)}`).emit('new_notification', {
      message: `You have been assigned to Room ${bed.roomNumber}, Bed ${bed.bedNumber} (${bed.ward} Ward)`,
      type: 'bed',
    });
  } catch (e) {
    /* ignore */
  }

  await logActivity({
    userId: req.user._id,
    action: 'STATUS_CHANGE',
    entity: 'Bed',
    entityId: bed._id,
    details: `Patient assigned to Room ${bed.roomNumber}, Bed ${bed.bedNumber}`,
    ipAddress: req.ip,
  });

  // Real-time update
  emitBedUpdated(req.io, updated);

  res.json(updated);
};

// @desc    Discharge patient from bed
// @route   PUT /api/beds/:id/discharge
const dischargeBed = async (req, res) => {
  const session = await mongoose.startSession();
  let patientToNotify = null;
  let createdInvoiceId = null;
  let totalAmount = 0;
  let roomNumber = '';
  let bedNumber = '';
  let ward = '';

  try {
    session.startTransaction();

    const bed = await Bed.findById(req.params.id).session(session);

    if (!bed) {
      res.status(404);
      throw new Error('Bed not found');
    }

    if (bed.status !== 'Occupied' || !bed.patient) {
      res.status(400);
      throw new Error('Bed is not currently occupied');
    }

    patientToNotify = String(bed.patient);
    const admissionDate = bed.admissionDate || bed.createdAt;
    const dischargeDate = new Date();

    // Calculate days stayed (minimum 1 day)
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysStayed = Math.max(
      1,
      Math.ceil((dischargeDate - admissionDate) / msPerDay),
    );
    const dailyRate = Number(bed.dailyRate) || 500;
    totalAmount = daysStayed * dailyRate;

    const [createdInvoice] = await Invoice.create(
      [
        {
          patient: bed.patient,
          createdBy: req.user._id,
          invoiceType: 'Bed',
          items: [
            {
              description: `Bed Stay - Room ${bed.roomNumber}, Bed ${bed.bedNumber} (${bed.ward} Ward)`,
              cost: totalAmount,
            },
            {
              description: `${daysStayed} day(s) × ₹${dailyRate}/day`,
              cost: 0,
            },
          ],
          total: totalAmount,
          status: 'Unpaid',
        },
      ],
      { session },
    );

    createdInvoiceId = createdInvoice?._id;

    roomNumber = bed.roomNumber;
    bedNumber = bed.bedNumber;
    ward = bed.ward;

    bed.patient = null;
    bed.assignedBy = null;
    bed.status = 'Available';
    bed.dischargeDate = dischargeDate;

    await bed.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  const updatedBed = await Bed.findById(req.params.id)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('assignedBy', 'firstName lastName profileImage');

  // Notify patient about discharge + pending bill
  if (patientToNotify) {
    try {
      await Notification.create({
        user: patientToNotify,
        title: 'Discharged – Bill Generated',
        message: `You have been discharged from Room ${roomNumber}, Bed ${bedNumber}. A bill of ₹${totalAmount} has been generated.`,
        type: 'bed',
        link: '/bills',
      });

      // Notify patient via socket
      req.io.to(`user:${patientToNotify}`).emit('new_notification', {
        message: `You have been discharged from Room ${roomNumber}, Bed ${bedNumber}. A bill of ₹${totalAmount} has been generated.`,
        type: 'bed',
      });
    } catch (e) {
      /* ignore */
    }
  }

  if (createdInvoiceId && patientToNotify) {
    const fullInvoice = await Invoice.findById(createdInvoiceId)
      .populate('patient', 'firstName lastName email profileImage')
      .populate('doctor', 'firstName lastName profileImage')
      .populate('createdBy', 'firstName lastName profileImage');

    if (fullInvoice) {
      emitInvoiceUpdated(req.io, patientToNotify, fullInvoice);
    }
  }

  await logActivity({
    userId: req.user._id,
    action: 'STATUS_CHANGE',
    entity: 'Bed',
    entityId: updatedBed._id,
    details: `Patient discharged from Room ${roomNumber}, Bed ${bedNumber} (${ward} Ward). Invoice ₹${totalAmount} generated.`,
    ipAddress: req.ip,
  });

  // Real-time update
  emitBedUpdated(req.io, updatedBed);

  res.json(updatedBed);
};

// @desc    Update bed status/details
// @route   PUT /api/beds/:id
const updateBed = async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) {
    res.status(404);
    throw new Error('Bed not found');
  }

  const { status, ward, dailyRate, notes, roomNumber, bedNumber } = req.body;
  if (status) bed.status = status;
  if (ward) bed.ward = ward;
  if (dailyRate !== undefined) bed.dailyRate = dailyRate;
  if (notes !== undefined) bed.notes = notes;
  if (roomNumber) bed.roomNumber = roomNumber;
  if (bedNumber) bed.bedNumber = bedNumber;

  await bed.save();

  await logActivity({
    userId: req.user._id,
    action: 'UPDATE',
    entity: 'Bed',
    entityId: bed._id,
    details: `Bed updated: Room ${bed.roomNumber}, Bed ${bed.bedNumber}`,
    ipAddress: req.ip,
  });

  const updated = await Bed.findById(bed._id)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('assignedBy', 'firstName lastName profileImage');

  // Real-time update
  emitBedUpdated(req.io, updated);

  res.json(updated);
};

// @desc    Delete a bed
// @route   DELETE /api/beds/:id
const deleteBed = async (req, res) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) {
    res.status(404);
    throw new Error('Bed not found');
  }

  await logActivity({
    userId: req.user._id,
    action: 'DELETE',
    entity: 'Bed',
    entityId: bed._id,
    details: `Bed deleted: Room ${bed.roomNumber}, Bed ${bed.bedNumber}`,
    ipAddress: req.ip,
  });

  await bed.deleteOne();
  res.json({ message: 'Bed removed' });
};

export { getBeds, addBed, assignBed, dischargeBed, updateBed, deleteBed };
