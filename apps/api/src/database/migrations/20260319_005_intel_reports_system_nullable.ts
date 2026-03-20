import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('intel_reports', (t) => {
    t.integer('solar_system_id').unsigned().nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('intel_reports', (t) => {
    t.integer('solar_system_id').unsigned().notNullable().alter();
  });
}
