import express from 'express';
import {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
} from '../controllers/leaveController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, applyLeave);
router.get('/my', protect, getMyLeaves);
router.get('/', protect, authorize('Admin'), getAllLeaves);
router.put('/:id/status', protect, authorize('Admin'), updateLeaveStatus);

export default router;
