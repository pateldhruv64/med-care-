const REQUIRED_ENV_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'FRONTEND_URL',
  'ADMIN_SECRET_KEY',
];

const validateEnv = () => {
  const missingEnvVars = REQUIRED_ENV_VARS.filter(
    (envKey) => !String(process.env[envKey] || '').trim(),
  );

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}`,
    );
  }
};

export { validateEnv };
