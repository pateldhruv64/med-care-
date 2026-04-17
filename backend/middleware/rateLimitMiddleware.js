import rateLimit from 'express-rate-limit';

const buildJsonRateLimiter = ({
  windowMs,
  max,
  message,
  skipSuccessfulRequests = false,
}) =>
  rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ message });
    },
  });

const loginRateLimiter = buildJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: true,
});

const registerRateLimiter = buildJsonRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts. Please try again in 1 hour.',
  skipSuccessfulRequests: false,
});

export { loginRateLimiter, registerRateLimiter };
