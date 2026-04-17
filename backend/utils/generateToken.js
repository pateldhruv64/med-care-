import jwt from 'jsonwebtoken';

const DEFAULT_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getTokenMaxAge = () => {
  const configured = Number.parseInt(process.env.JWT_COOKIE_MAX_AGE_MS, 10);

  if (Number.isNaN(configured) || configured <= 0) {
    return DEFAULT_TOKEN_MAX_AGE_MS;
  }

  return configured;
};

const generateToken = (res, userId, role) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  const token = jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn,
  });

  res.cookie('jwt', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: getTokenMaxAge(),
  });

  return token;
};

export default generateToken;
