import { validationResult } from 'express-validator';

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    next();
    return;
  }

  const message = errors
    .array({ onlyFirstError: true })
    .map((error) => error.msg)
    .join(', ');

  res.status(400);
  throw new Error(message || 'Invalid request payload');
};

export { validateRequest };
