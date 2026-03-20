import { Global, Module } from '@nestjs/common';
import { KnexProvider, KNEX_TOKEN } from './knex.provider';

@Global()
@Module({
  providers: [KnexProvider],
  exports: [KNEX_TOKEN],
})
export class DatabaseModule {}
