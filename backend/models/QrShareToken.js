import mongoose from 'mongoose';

const qrShareTokenSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    usedByIp: {
      type: String,
      default: '',
    },
    usedByUserAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

// Automatically remove expired token documents.
qrShareTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helpful for patient-level cleanup/audits.
qrShareTokenSchema.index({ patient: 1, createdAt: -1 });

const QrShareToken = mongoose.model('QrShareToken', qrShareTokenSchema);

export default QrShareToken;
