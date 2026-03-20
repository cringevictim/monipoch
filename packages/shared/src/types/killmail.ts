import { z } from 'zod';

export const ZKBMetadataSchema = z.object({
  locationID: z.number().optional(),
  hash: z.string(),
  fittedValue: z.number().default(0),
  droppedValue: z.number().default(0),
  destroyedValue: z.number().default(0),
  totalValue: z.number().default(0),
  points: z.number().default(0),
  npc: z.boolean().default(false),
  solo: z.boolean().default(false),
  awox: z.boolean().default(false),
}).passthrough();

export const KillmailAttackerSchema = z.object({
  alliance_id: z.number().optional(),
  character_id: z.number().optional(),
  corporation_id: z.number().optional(),
  damage_done: z.number().default(0),
  final_blow: z.boolean().default(false),
  security_status: z.number().optional(),
  ship_type_id: z.number().optional(),
  weapon_type_id: z.number().optional(),
  faction_id: z.number().optional(),
}).passthrough();

export const KillmailVictimSchema = z.object({
  alliance_id: z.number().optional(),
  character_id: z.number().optional(),
  corporation_id: z.number().optional(),
  damage_taken: z.number().default(0),
  ship_type_id: z.number(),
  faction_id: z.number().optional(),
  items: z.array(z.any()).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
}).passthrough();

export const ESIKillmailSchema = z.object({
  killmail_id: z.number(),
  killmail_time: z.string(),
  solar_system_id: z.number(),
  victim: KillmailVictimSchema,
  attackers: z.array(KillmailAttackerSchema),
}).passthrough();

/**
 * killmail.stream sends a flat format: ESI killmail fields at top level + zkb.
 * We normalize into { killID, killmail, zkb } for internal use.
 */
export const RedisQKillmailSchema = z
  .object({
    killmail_id: z.number(),
    killmail_time: z.string(),
    solar_system_id: z.number(),
    victim: KillmailVictimSchema,
    attackers: z.array(KillmailAttackerSchema),
    zkb: ZKBMetadataSchema,
  })
  .passthrough()
  .transform((raw) => ({
    killID: raw.killmail_id,
    killmail: {
      killmail_id: raw.killmail_id,
      killmail_time: raw.killmail_time,
      solar_system_id: raw.solar_system_id,
      victim: raw.victim,
      attackers: raw.attackers,
    },
    zkb: raw.zkb,
  }));

export type ZKBMetadata = z.infer<typeof ZKBMetadataSchema>;
export type KillmailAttacker = z.infer<typeof KillmailAttackerSchema>;
export type KillmailVictim = z.infer<typeof KillmailVictimSchema>;
export type ESIKillmail = z.infer<typeof ESIKillmailSchema>;
export type RedisQKillmail = z.output<typeof RedisQKillmailSchema>;
