import express from 'express';
import {
  authUser,
  registerUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload, uploadToCloudinary } from '../middleware/uploadMiddleware.js';
import { validateRequest } from '../middleware/validationMiddleware.js';
import {
  loginRateLimiter,
  registerRateLimiter,
} from '../middleware/rateLimitMiddleware.js';
import User from '../models/User.js';
import logActivity from '../utils/logActivity.js';
import {
  loginValidationRules,
  registerValidationRules,
} from '../validators/authValidators.js';

const router = express.Router();

router.post(
  '/register',
  registerRateLimiter,
  registerValidationRules,
  validateRequest,
  registerUser,
);
router.post(
  '/login',
  loginRateLimiter,
  loginValidationRules,
  validateRequest,
  authUser,
);
router.post('/logout', logoutUser);
router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

// Profile picture upload
router.post(
  '/profile/upload-picture',
  protect,
  upload.single('profileImage'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400);
        throw new Error('No file uploaded');
      }

      const result = await uploadToCloudinary(req.file.buffer);

      const user = await User.findById(req.user._id);
      user.profileImage = result.secure_url;
      await user.save();

      await logActivity({
        userId: req.user._id,
        action: 'UPLOAD',
        entity: 'Profile',
        entityId: req.user._id,
        details: 'Profile picture uploaded',
        ipAddress: req.ip,
      });

      res.json({
        profileImage: result.secure_url,
        message: 'Profile picture uploaded successfully',
      });
    } catch (error) {
      console.error('Upload Error:', error);
      res.status(500).json({ message: error.message || 'Upload failed' });
    }
  },
);

export default router;
