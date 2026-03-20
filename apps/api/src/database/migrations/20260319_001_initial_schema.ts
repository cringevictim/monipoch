import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('alliances', (t) => {
    t.integer('alliance_id').unsigned().primary();
    t.string('name', 255).notNullable();
    t.string('ticker', 10).notNullable();
    t.timestamp('last_updated').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('corporations', (t) => {
    t.integer('corporation_id').unsigned().primary();
    t.string('name', 255).notNullable();
    t.string('ticker', 10).notNullable();
    t.integer('alliance_id').unsigned().nullable();
    t.integer('member_count').unsigned().defaultTo(0);
    t.timestamp('last_updated').defaultTo(knex.fn.now());
    t.foreign('alliance_id').references('alliances.alliance_id');
  });

  await knex.schema.createTable('characters', (t) => {
    t.integer('character_id').unsigned().primary();
    t.string('name', 255).notNullable();
    t.integer('corporation_id').unsigned().notNullable();
    t.integer('alliance_id').unsigned().nullable();
    t.timestamp('last_updated').defaultTo(knex.fn.now());
    t.foreign('corporation_id').references('corporations.corporation_id');
    t.foreign('alliance_id').references('alliances.alliance_id');
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.integer('character_id').unsigned().notNullable().unique();
    t.text('refresh_token').nullable();
    t.text('scopes').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('last_login').defaultTo(knex.fn.now());
    t.foreign('character_id').references('characters.character_id');
  });

  await knex.schema.createTable('killmails', (t) => {
    t.integer('killmail_id').unsigned().primary();
    t.string('hash', 64).notNullable();
    t.integer('solar_system_id').unsigned().notNullable();
    t.timestamp('killmail_time').notNullable();
    t.integer('victim_character_id').unsigned().nullable();
    t.integer('victim_corporation_id').unsigned().nullable();
    t.integer('victim_alliance_id').unsigned().nullable();
    t.integer('victim_ship_type_id').unsigned().notNullable();
    t.bigInteger('total_value').unsigned().defaultTo(0);
    t.integer('attacker_count').unsigned().defaultTo(0);
    t.boolean('is_npc').defaultTo(false);
    t.boolean('is_solo').defaultTo(false);
    t.timestamp('ingested_at').defaultTo(knex.fn.now());

    t.index('solar_system_id');
    t.index('killmail_time');
    t.index('victim_alliance_id');
    t.index(['solar_system_id', 'killmail_time']);
  });

  await knex.schema.createTable('killmail_attackers', (t) => {
    t.increments('id').primary();
    t.integer('killmail_id').unsigned().notNullable();
    t.integer('character_id').unsigned().nullable();
    t.integer('corporation_id').unsigned().nullable();
    t.integer('alliance_id').unsigned().nullable();
    t.integer('ship_type_id').unsigned().nullable();
    t.integer('weapon_type_id').unsigned().nullable();
    t.integer('damage_done').unsigned().defaultTo(0);
    t.boolean('final_blow').defaultTo(false);
    t.integer('faction_id').unsigned().nullable();

    t.foreign('killmail_id').references('killmails.killmail_id').onDelete('CASCADE');
    t.index('killmail_id');
    t.index('character_id');
    t.index('alliance_id');
    t.index('corporation_id');
  });

  await knex.schema.createTable('fights', (t) => {
    t.string('id', 36).primary();
    t.integer('solar_system_id').unsigned().notNullable();
    t.enum('status', ['ongoing', 'concluded']).notNullable().defaultTo('ongoing');
    t.enum('classification', [
      'solo',
      'small_gang',
      'medium_gang',
      'large_fleet',
      'capital_escalation',
    ]).nullable();
    t.timestamp('started_at').notNullable();
    t.timestamp('last_kill_at').notNullable();
    t.timestamp('ended_at').nullable();
    t.integer('total_kills').unsigned().defaultTo(0);
    t.bigInteger('total_isk_destroyed').unsigned().defaultTo(0);

    t.index('solar_system_id');
    t.index('status');
    t.index(['solar_system_id', 'status']);
  });

  await knex.schema.createTable('fight_sides', (t) => {
    t.increments('id').primary();
    t.string('fight_id', 36).notNullable();
    t.integer('alliance_id').unsigned().nullable();
    t.integer('corporation_id').unsigned().nullable();
    t.integer('pilot_count').unsigned().defaultTo(0);
    t.bigInteger('isk_lost').unsigned().defaultTo(0);
    t.integer('kill_count').unsigned().defaultTo(0);
    t.json('ship_type_ids').nullable();

    t.foreign('fight_id').references('fights.id').onDelete('CASCADE');
    t.index('fight_id');
  });

  await knex.schema.createTable('fight_killmails', (t) => {
    t.string('fight_id', 36).notNullable();
    t.integer('killmail_id').unsigned().notNullable();
    t.primary(['fight_id', 'killmail_id']);

    t.foreign('fight_id').references('fights.id').onDelete('CASCADE');
    t.foreign('killmail_id').references('killmails.killmail_id').onDelete('CASCADE');
  });

  await knex.schema.createTable('hostile_profiles', (t) => {
    t.increments('id').primary();
    t.enum('entity_type', ['character', 'alliance', 'corporation']).notNullable();
    t.integer('entity_id').unsigned().notNullable();
    t.string('entity_name', 255).notNullable();
    t.integer('total_kills').unsigned().defaultTo(0);
    t.integer('total_losses').unsigned().defaultTo(0);
    t.bigInteger('total_isk_destroyed').unsigned().defaultTo(0);
    t.bigInteger('total_isk_lost').unsigned().defaultTo(0);
    t.float('threat_score').defaultTo(0);
    t.json('preferred_ship_types').nullable();
    t.json('activity_by_hour').nullable();
    t.json('preferred_systems').nullable();
    t.integer('avg_fleet_size').unsigned().nullable();
    t.timestamp('first_seen').nullable();
    t.timestamp('last_seen').nullable();
    t.string('last_seen_system', 100).nullable();
    t.timestamp('last_updated').defaultTo(knex.fn.now());

    t.unique(['entity_type', 'entity_id']);
    t.index('threat_score');
    t.index('last_seen');
  });

  await knex.schema.createTable('gate_camps', (t) => {
    t.increments('id').primary();
    t.integer('solar_system_id').unsigned().notNullable();
    t.integer('attacker_alliance_id').unsigned().nullable();
    t.integer('attacker_corporation_id').unsigned().nullable();
    t.string('attacker_entity_name', 255).nullable();
    t.json('ship_type_ids').nullable();
    t.integer('kill_count').unsigned().defaultTo(0);
    t.timestamp('detected_at').notNullable();
    t.timestamp('last_kill_at').notNullable();
    t.boolean('is_active').defaultTo(true);

    t.index(['solar_system_id', 'is_active']);
    t.index('detected_at');
  });

  await knex.schema.createTable('system_npc_kills', (t) => {
    t.increments('id').primary();
    t.integer('solar_system_id').unsigned().notNullable();
    t.integer('npc_kills').unsigned().defaultTo(0);
    t.integer('ship_kills').unsigned().defaultTo(0);
    t.integer('pod_kills').unsigned().defaultTo(0);
    t.timestamp('snapshot_time').notNullable();

    t.index(['solar_system_id', 'snapshot_time']);
  });

  await knex.schema.createTable('wormhole_connections', (t) => {
    t.increments('id').primary();
    t.integer('from_system_id').unsigned().notNullable();
    t.integer('to_system_id').unsigned().notNullable();
    t.string('wormhole_type', 10).nullable();
    t.enum('mass_status', ['fresh', 'reduced', 'critical']).defaultTo('fresh');
    t.timestamp('estimated_eol').nullable();
    t.integer('reported_by_user_id').unsigned().notNullable();
    t.timestamp('reported_at').defaultTo(knex.fn.now());
    t.boolean('is_active').defaultTo(true);

    t.foreign('reported_by_user_id').references('users.id');
    t.index('is_active');
  });

  await knex.schema.createTable('intel_reports', (t) => {
    t.increments('id').primary();
    t.integer('solar_system_id').unsigned().nullable();
    t.text('raw_text').notNullable();
    t.json('parsed_ships').nullable();
    t.integer('pilot_count').unsigned().nullable();
    t.integer('reported_by_user_id').unsigned().notNullable();
    t.timestamp('reported_at').defaultTo(knex.fn.now());

    t.foreign('reported_by_user_id').references('users.id');
    t.index(['solar_system_id', 'reported_at']);
  });

  await knex.schema.createTable('alert_rules', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable();
    t.string('event_type', 100).notNullable();
    t.json('conditions').nullable();
    t.boolean('enabled').defaultTo(true);
    t.boolean('browser_notify').defaultTo(true);
    t.boolean('discord_notify').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.foreign('user_id').references('users.id').onDelete('CASCADE');
    t.index(['user_id', 'enabled']);
  });

  await knex.schema.createTable('discord_webhooks', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable();
    t.string('name', 100).notNullable();
    t.text('webhook_url').notNullable();
    t.json('event_types').nullable();
    t.boolean('enabled').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.foreign('user_id').references('users.id').onDelete('CASCADE');
  });

  await knex.schema.createTable('daily_system_stats', (t) => {
    t.increments('id').primary();
    t.integer('solar_system_id').unsigned().notNullable();
    t.date('stat_date').notNullable();
    t.integer('total_kills').unsigned().defaultTo(0);
    t.bigInteger('total_isk_destroyed').unsigned().defaultTo(0);
    t.integer('unique_alliances').unsigned().defaultTo(0);
    t.integer('unique_pilots').unsigned().defaultTo(0);
    t.integer('fight_count').unsigned().defaultTo(0);
    t.integer('camp_count').unsigned().defaultTo(0);

    t.unique(['solar_system_id', 'stat_date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('daily_system_stats');
  await knex.schema.dropTableIfExists('discord_webhooks');
  await knex.schema.dropTableIfExists('alert_rules');
  await knex.schema.dropTableIfExists('intel_reports');
  await knex.schema.dropTableIfExists('wormhole_connections');
  await knex.schema.dropTableIfExists('system_npc_kills');
  await knex.schema.dropTableIfExists('gate_camps');
  await knex.schema.dropTableIfExists('hostile_profiles');
  await knex.schema.dropTableIfExists('fight_killmails');
  await knex.schema.dropTableIfExists('fight_sides');
  await knex.schema.dropTableIfExists('fights');
  await knex.schema.dropTableIfExists('killmail_attackers');
  await knex.schema.dropTableIfExists('killmails');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('characters');
  await knex.schema.dropTableIfExists('corporations');
  await knex.schema.dropTableIfExists('alliances');
}
