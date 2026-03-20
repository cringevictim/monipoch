import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('monipoch'),
  DB_PASSWORD: z.string().default('monipoch_dev'),
  DB_NAME: z.string().default('monipoch'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),

  EVE_CLIENT_ID: z.string(),
  EVE_CLIENT_SECRET: z.string(),
  EVE_CALLBACK_URL: z.string().url(),
  ALLOWED_ALLIANCE_ID: z.coerce.number(),

  JWT_SECRET: z.string(),
  JWT_EXPIRATION: z.string().default('7d'),

  CORS_ORIGIN: z.string().default(''),
  FRONTEND_URL: z.string().default(''),

  DEBUG: z.coerce.boolean().default(false),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function validateEnv(): AppEnv {
  return EnvSchema.parse(process.env);
}

export default () => {
  const env = validateEnv();
  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      name: env.DB_NAME,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
    },
    eve: {
      clientId: env.EVE_CLIENT_ID,
      clientSecret: env.EVE_CLIENT_SECRET,
      callbackUrl: env.EVE_CALLBACK_URL,
      allowedAllianceId: env.ALLOWED_ALLIANCE_ID,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiration: env.JWT_EXPIRATION,
    },
    corsOrigin: env.CORS_ORIGIN,
    frontendUrl: env.FRONTEND_URL,
    debug: env.DEBUG,
  };
};
