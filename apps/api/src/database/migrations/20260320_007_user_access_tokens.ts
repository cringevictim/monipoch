import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.text('access_token').nullable().after('refresh_token');
    t.timestamp('access_token_expires_at').nullable().after('access_token');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('access_token');
    t.dropColumn('access_token_expires_at');
  });
}
