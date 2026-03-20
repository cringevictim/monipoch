import { type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { type Knex } from 'knex';

export const KNEX_TOKEN = Symbol('KNEX_CONNECTION');

export const KnexProvider: Provider<Knex> = {
  provide: KNEX_TOKEN,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Knex => {
    return knex({
      client: 'mysql2',
      connection: {
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        user: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
      },
      pool: { min: 2, max: 10 },
      migrations: {
        directory: './src/database/migrations',
        extension: 'ts',
      },
    });
  },
};
