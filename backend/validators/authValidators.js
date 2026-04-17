import { body } from 'express-validator';

const nameValidation = (fieldName, label) =>
  body(fieldName)
    .trim()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isLength({ min: 2, max: 50 })
    .withMessage(`${label} must be between 2 and 50 characters`);

const passwordValidation = body('password')
  .isString()
  .withMessage('Password is required')
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be between 8 and 128 characters')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
  .withMessage(
    'Password must include uppercase, lowercase, number, and special character',
  );

const registerValidationRules = [
  nameValidation('firstName', 'First name'),
  nameValidation('lastName', 'Last name'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Email must be valid')
    .normalizeEmail(),
  passwordValidation,
  body('role')
    .optional({ values: 'falsy' })
    .equals('Patient')
    .withMessage('Public registration supports Patient role only'),
  body('gender')
    .optional({ values: 'falsy' })
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be Male, Female, or Other'),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9+\-\s()]{7,20}$/)
    .withMessage('Phone number format is invalid'),
  body('dateOfBirth')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Date of birth must be a valid date')
    .toDate(),
];

const loginValidationRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Email must be valid')
    .normalizeEmail(),
  body('password')
    .isString()
    .withMessage('Password is required')
    .notEmpty()
    .withMessage('Password is required'),
];

export { loginValidationRules, registerValidationRules };
