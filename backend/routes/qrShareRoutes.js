import express from 'express';
import {
  generatePatientQrShareLink,
  resolvePatientQrShareDetails,
} from '../controllers/qrShareController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post(
  '/patients/:patientId/link',
  protect,
  authorize('Admin', 'Doctor', 'Receptionist', 'Pharmacist'),
  generatePatientQrShareLink,
);

router
  .route('/patients/:patientId/details')
  .get(resolvePatientQrShareDetails)
  .post(resolvePatientQrShareDetails);

export default router;
