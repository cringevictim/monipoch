import 'dotenv/config';
import type { Knex } from 'knex';

const config: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'monipoch',
    password: process.env.DB_PASSWORD ?? 'monipoch_dev',
    database: process.env.DB_NAME ?? 'monipoch',
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  pool: { min: 2, max: 10 },
};

export default config;
