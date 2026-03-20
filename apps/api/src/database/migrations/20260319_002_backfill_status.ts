import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('backfill_status', (t) => {
    t.date('date').primary();
    t.enum('status', ['pending', 'in_progress', 'complete', 'failed'])
      .notNullable()
      .defaultTo('pending');
    t.integer('killmails_found').unsigned().defaultTo(0);
    t.integer('killmails_inserted').unsigned().defaultTo(0);
    t.timestamp('started_at').nullable();
    t.timestamp('completed_at').nullable();
    t.text('error_message').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('backfill_status');
}
