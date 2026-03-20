import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sound_preferences', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().unique();
    t.boolean('kill_sound').notNullable().defaultTo(true);
    t.boolean('fight_sound').notNullable().defaultTo(true);
    t.boolean('camp_sound').notNullable().defaultTo(true);
    t.boolean('roam_sound').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sound_preferences');
}
