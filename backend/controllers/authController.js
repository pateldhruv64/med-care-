import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import bcrypt from 'bcryptjs';
import logActivity from '../utils/logActivity.js';

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const authUser = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });
  const passwordHash = user?.password || DUMMY_PASSWORD_HASH;
  const match = await bcrypt.compare(password, passwordHash);

  if (!user || !match) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  const token = generateToken(res, user._id, user.role);

  await logActivity({
    userId: user._id,
    action: 'LOGIN',
    entity: 'User',
    entityId: user._id,
    details: `User ${user.firstName} ${user.lastName} logged in`,
    ipAddress: req.ip,
  });

  res.json({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    profileImage: user.profileImage,
    token,
  });
};

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role,
    gender,
    phone,
    dateOfBirth,
  } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  const requestedRole = role || 'Patient';

  if (requestedRole !== 'Patient') {
    res.status(403);
    throw new Error(
      'Public registration supports Patient role only. Contact Admin for staff onboarding.',
    );
  }

  const userExists = await User.findOne({ email: normalizedEmail });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await User.create({
    firstName,
    lastName,
    email: normalizedEmail,
    password,
    role: 'Patient',
    gender,
    phone,
    dateOfBirth,
  });

  if (user) {
    const token = generateToken(res, user._id, user.role);

    await logActivity({
      userId: user._id,
      action: 'CREATE',
      entity: 'User',
      entityId: user._id,
      details: `New ${user.role} registered: ${user.firstName} ${user.lastName}`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      token,
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
};

// @desc    Create staff user account (Admin only)
// @route   POST /api/users/staff
// @access  Private (Admin)
const createStaffUser = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role,
    gender,
    phone,
    dateOfBirth,
    doctorDepartment,
  } = req.body;

  const normalizedEmail = String(email).trim().toLowerCase();
  const allowedRoles = ['Doctor', 'Receptionist', 'Pharmacist'];

  if (!allowedRoles.includes(role)) {
    res.status(400);
    throw new Error('Invalid staff role');
  }

  if (role === 'Doctor' && !String(doctorDepartment || '').trim()) {
    res.status(400);
    throw new Error('Doctor department is required for Doctor role');
  }

  const userExists = await User.findOne({ email: normalizedEmail });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const staffUser = await User.create({
    firstName,
    lastName,
    email: normalizedEmail,
    password,
    role,
    gender,
    phone,
    dateOfBirth,
    doctorDepartment: role === 'Doctor' ? doctorDepartment : undefined,
  });

  if (!staffUser) {
    res.status(400);
    throw new Error('Invalid staff data');
  }

  await logActivity({
    userId: req.user._id,
    action: 'CREATE',
    entity: 'User',
    entityId: staffUser._id,
    details: `Staff account created: ${staffUser.role} - ${staffUser.firstName} ${staffUser.lastName}`,
    ipAddress: req.ip,
  });

  res.status(201).json({
    _id: staffUser._id,
    firstName: staffUser.firstName,
    lastName: staffUser.lastName,
    email: staffUser.email,
    role: staffUser.role,
    phone: staffUser.phone,
    gender: staffUser.gender,
    dateOfBirth: staffUser.dateOfBirth,
    doctorDepartment: staffUser.doctorDepartment,
  });
};

// @desc    Logout user / clear cookie
// @route   POST /api/users/logout
// @access  Public
const logoutUser = async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (req.cookies.jwt) {
    try {
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(
        req.cookies.jwt,
        process.env.JWT_SECRET,
      );
      await logActivity({
        userId: decoded.userId,
        action: 'LOGOUT',
        entity: 'User',
        entityId: decoded.userId,
        details: 'User logged out',
        ipAddress: req.ip,
      });
    } catch (e) {
      /* ignore */
    }
  }

  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });
  res.status(200).json({ message: 'Logged out successfully' });
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      phone: user.phone,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      profileImage: user.profileImage,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  user.firstName = req.body.firstName || user.firstName;
  user.lastName = req.body.lastName || user.lastName;
  user.phone = req.body.phone || user.phone;

  if (req.body.password) {
    user.password = req.body.password;
  }

  const updatedUser = await user.save();

  await logActivity({
    userId: req.user._id,
    action: 'UPDATE',
    entity: 'Profile',
    entityId: req.user._id,
    details: `Profile updated by ${updatedUser.firstName} ${updatedUser.lastName}`,
    ipAddress: req.ip,
  });

  res.json({
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    role: updatedUser.role,
    phone: updatedUser.phone,
    profileImage: updatedUser.profileImage,
  });
};

export {
  authUser,
  registerUser,
  createStaffUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
};
