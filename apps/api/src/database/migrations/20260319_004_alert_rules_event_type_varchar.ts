import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('alert_rules', (t) => {
    t.string('event_type', 100).notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('alert_rules', (t) => {
    t.enum('event_type', [
      'fight_started',
      'camp_detected',
      'hostile_sighted',
      'capital_on_field',
      'npc_spike',
      'alliance_loss',
    ])
      .notNullable()
      .alter();
  });
}
