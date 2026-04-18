import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Medicine from '../models/Medicine.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import logActivity from '../utils/logActivity.js';

const ALLOWED_INVOICE_TYPES = new Set(['Consultation', 'Pharmacy', 'Bed']);
const BILLING_ROLE_ROOMS = [
  'role:Admin',
  'role:Receptionist',
  'role:Pharmacist',
];

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const emitInvoiceUpdated = (io, patientId, payload) => {
  let emitter = io.to(`user:${String(patientId)}`);
  for (const room of BILLING_ROLE_ROOMS) {
    emitter = emitter.to(room);
  }
  emitter.emit('invoice_updated', payload);
};

// @desc    Create an invoice
// @route   POST /api/invoices
// @access  Private (Admin, Receptionist, Pharmacist)
const createInvoice = async (req, res) => {
  const {
    patientId,
    doctorId,
    appointmentId,
    items,
    invoiceType,
    medicineItems,
  } = req.body;
  const selectedInvoiceType = ALLOWED_INVOICE_TYPES.has(invoiceType)
    ? invoiceType
    : 'Consultation';

  if (!patientId || !isValidObjectId(patientId)) {
    res.status(400);
    throw new Error('Valid patientId is required');
  }

  const normalizedItems = Array.isArray(items)
    ? items.map((item, index) => {
        const description = String(item?.description || '').trim();
        const cost = Number(item?.cost);

        if (!description) {
          res.status(400);
          throw new Error(`Item description is required for row ${index + 1}`);
        }

        if (!Number.isFinite(cost) || cost < 0) {
          res.status(400);
          throw new Error(
            `Item cost must be a non-negative number for row ${index + 1}`,
          );
        }

        return {
          description,
          cost,
        };
      })
    : [];

  if (normalizedItems.length === 0) {
    res.status(400);
    throw new Error('At least one invoice item is required');
  }

  const total = normalizedItems.reduce((acc, item) => acc + item.cost, 0);
  if (!Number.isFinite(total) || total <= 0) {
    res.status(400);
    throw new Error('Invoice total must be greater than 0');
  }

  const patient = await User.findById(patientId).select('_id role');
  if (!patient || patient.role !== 'Patient') {
    res.status(404);
    throw new Error('Patient not found');
  }

  if (doctorId) {
    if (!isValidObjectId(doctorId)) {
      res.status(400);
      throw new Error('doctorId is invalid');
    }

    const doctor = await User.findById(doctorId).select('_id role');
    if (!doctor || doctor.role !== 'Doctor') {
      res.status(404);
      throw new Error('Doctor not found');
    }
  }

  if (appointmentId) {
    if (!isValidObjectId(appointmentId)) {
      res.status(400);
      throw new Error('appointmentId is invalid');
    }

    const appointment = await Appointment.findById(appointmentId)
      .select('patient doctor')
      .lean();

    if (!appointment) {
      res.status(404);
      throw new Error('Appointment not found');
    }

    if (String(appointment.patient) !== String(patientId)) {
      res.status(400);
      throw new Error('Appointment does not belong to this patient');
    }

    if (doctorId && String(appointment.doctor) !== String(doctorId)) {
      res.status(400);
      throw new Error('Appointment does not belong to this doctor');
    }
  }

  const normalizedMedicineItems = [];
  if (selectedInvoiceType === 'Pharmacy') {
    if (!Array.isArray(medicineItems) || medicineItems.length === 0) {
      res.status(400);
      throw new Error('medicineItems are required for pharmacy invoices');
    }

    for (const [index, medicineItem] of medicineItems.entries()) {
      const medicineId = medicineItem?.medicineId;
      const quantity = Number(medicineItem?.quantity);

      if (!medicineId || !isValidObjectId(medicineId)) {
        res.status(400);
        throw new Error(
          `Valid medicineId is required for medicine row ${index + 1}`,
        );
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        res.status(400);
        throw new Error(
          `Quantity must be a positive integer for medicine row ${index + 1}`,
        );
      }

      normalizedMedicineItems.push({
        medicineId,
        quantity,
      });
    }
  }

  const session = await mongoose.startSession();
  let createdInvoice;

  try {
    session.startTransaction();

    if (selectedInvoiceType === 'Pharmacy') {
      for (const medicineItem of normalizedMedicineItems) {
        const medicine = await Medicine.findById(
          medicineItem.medicineId,
        ).session(session);

        if (!medicine) {
          res.status(404);
          throw new Error('Medicine not found for one or more selected items');
        }

        if (medicine.stock < medicineItem.quantity) {
          res.status(400);
          throw new Error(
            `Not enough stock for ${medicine.name}. Available: ${medicine.stock}`,
          );
        }

        medicine.stock -= medicineItem.quantity;
        await medicine.save({ session });
      }
    }

    const [invoiceDoc] = await Invoice.create(
      [
        {
          patient: patientId,
          doctor: doctorId || undefined,
          appointment: appointmentId || undefined,
          items: normalizedItems,
          total,
          invoiceType: selectedInvoiceType,
          createdBy: req.user._id,
        },
      ],
      { session },
    );

    createdInvoice = invoiceDoc;

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  if (createdInvoice) {
    // Notify patient about new invoice
    try {
      await Notification.create({
        user: patientId,
        title: 'New Invoice',
        message: `An invoice of ₹${total} has been generated`,
        type: 'billing',
        link: '/bills',
      });

      // Notify patient via socket
      req.io.to(`user:${String(patientId)}`).emit('new_notification', {
        message: `An invoice of ₹${total} has been generated`,
        type: 'billing',
      });
    } catch (e) {
      /* ignore */
    }

    // START: Real-time list update
    const fullInvoice = await Invoice.findById(createdInvoice._id)
      .populate('patient', 'firstName lastName email profileImage')
      .populate('doctor', 'firstName lastName profileImage')
      .populate('createdBy', 'firstName lastName profileImage');

    // Secure broadcast: Patient + Billing operators
    emitInvoiceUpdated(req.io, patientId, fullInvoice);
    // END: Real-time list update

    await logActivity({
      userId: req.user._id,
      action: 'CREATE',
      entity: 'Invoice',
      entityId: createdInvoice._id,
      details: `Invoice created: ₹${total} (${selectedInvoiceType})`,
      ipAddress: req.ip,
    });

    res.status(201).json(createdInvoice);
  } else {
    res.status(400);
    throw new Error('Invalid invoice data');
  }
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
const getInvoices = async (req, res) => {
  let query = {};
  if (req.user.role === 'Patient') {
    query = { patient: req.user._id };
  } else if (req.user.role === 'Doctor') {
    query = { doctor: req.user._id };
  } else if (req.user.role === 'Pharmacist') {
    query = { createdBy: req.user._id };
  }

  const invoices = await Invoice.find(query)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('doctor', 'firstName lastName profileImage')
    .populate('createdBy', 'firstName lastName profileImage')
    .sort({ createdAt: -1 });

  res.json(invoices);
};

// @desc    Update invoice status (Pay)
// @route   PUT /api/invoices/:id/pay
// @access  Private (Admin, Receptionist, Pharmacist)
const updateInvoiceStatus = async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  invoice.status = 'Paid';
  await invoice.save();

  // Notify patient about payment confirmation
  try {
    await Notification.create({
      user: invoice.patient,
      title: 'Payment Confirmed',
      message: `Your invoice of ₹${invoice.total} has been marked as paid`,
      type: 'billing',
      link: '/bills',
    });

    // Notify patient via socket
    req.io.to(`user:${invoice.patient.toString()}`).emit('new_notification', {
      message: `Your invoice of ₹${invoice.total} has been marked as paid`,
      type: 'billing',
    });
  } catch (e) {
    /* ignore */
  }

  // START: Real-time list update
  const fullInvoice = await Invoice.findById(invoice._id)
    .populate('patient', 'firstName lastName email profileImage')
    .populate('doctor', 'firstName lastName profileImage')
    .populate('createdBy', 'firstName lastName profileImage');

  // Secure broadcast
  emitInvoiceUpdated(req.io, invoice.patient, fullInvoice);
  // END: Real-time list update

  await logActivity({
    userId: req.user._id,
    action: 'STATUS_CHANGE',
    entity: 'Invoice',
    entityId: invoice._id,
    details: `Invoice ₹${invoice.total} marked as paid`,
    ipAddress: req.ip,
  });

  res.json(invoice);
};

export { createInvoice, getInvoices, updateInvoiceStatus };
