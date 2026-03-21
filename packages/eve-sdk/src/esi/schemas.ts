import { z } from 'zod';

export const CharacterPublicSchema = z.object({
  alliance_id: z.number().optional(),
  birthday: z.string(),
  bloodline_id: z.number(),
  corporation_id: z.number(),
  description: z.string().optional(),
  faction_id: z.number().optional(),
  gender: z.enum(['female', 'male']),
  name: z.string(),
  race_id: z.number(),
  security_status: z.number().optional(),
  title: z.string().optional(),
});

export const CorporationPublicSchema = z.object({
  alliance_id: z.number().optional(),
  ceo_id: z.number(),
  creator_id: z.number(),
  date_founded: z.string().optional(),
  description: z.string().optional(),
  faction_id: z.number().optional(),
  home_station_id: z.number().optional(),
  member_count: z.number(),
  name: z.string(),
  shares: z.number().optional(),
  tax_rate: z.number(),
  ticker: z.string(),
  url: z.string().optional(),
});

export const AlliancePublicSchema = z.object({
  creator_corporation_id: z.number(),
  creator_id: z.number(),
  date_founded: z.string(),
  executor_corporation_id: z.number().optional(),
  faction_id: z.number().optional(),
  name: z.string(),
  ticker: z.string(),
});

export const CharacterAffiliationSchema = z.array(
  z.object({
    alliance_id: z.number().optional(),
    character_id: z.number(),
    corporation_id: z.number(),
    faction_id: z.number().optional(),
  }),
);

export const SystemKillsSchema = z.array(
  z.object({
    npc_kills: z.number(),
    pod_kills: z.number(),
    ship_kills: z.number(),
    system_id: z.number(),
  }),
);

export const KillmailDetailSchema = z.object({
  killmail_id: z.number(),
  killmail_time: z.string(),
  solar_system_id: z.number(),
  victim: z.object({
    alliance_id: z.number().optional(),
    character_id: z.number().optional(),
    corporation_id: z.number().optional(),
    damage_taken: z.number(),
    faction_id: z.number().optional(),
    ship_type_id: z.number(),
    items: z
      .array(
        z.object({
          flag: z.number(),
          item_type_id: z.number(),
          quantity_destroyed: z.number().optional(),
          quantity_dropped: z.number().optional(),
          singleton: z.number(),
        }),
      )
      .optional(),
    position: z
      .object({ x: z.number(), y: z.number(), z: z.number() })
      .optional(),
  }),
  attackers: z.array(
    z.object({
      alliance_id: z.number().optional(),
      character_id: z.number().optional(),
      corporation_id: z.number().optional(),
      damage_done: z.number(),
      faction_id: z.number().optional(),
      final_blow: z.boolean(),
      security_status: z.number().optional(),
      ship_type_id: z.number().optional(),
      weapon_type_id: z.number().optional(),
    }),
  ),
});

export const CharacterLocationSchema = z.object({
  solar_system_id: z.number(),
  station_id: z.number().optional(),
  structure_id: z.number().optional(),
});

export const CharacterOnlineSchema = z.object({
  online: z.boolean(),
  last_login: z.string().optional(),
  last_logout: z.string().optional(),
  logins: z.number().optional(),
});

export const CharacterShipSchema = z.object({
  ship_item_id: z.number(),
  ship_name: z.string(),
  ship_type_id: z.number(),
});

export const CharacterFleetInfoSchema = z.object({
  fleet_id: z.number(),
  role: z.enum(['fleet_commander', 'wing_commander', 'squad_commander', 'squad_member']),
  squad_id: z.number(),
  wing_id: z.number(),
});

export const FleetMemberSchema = z.object({
  character_id: z.number(),
  join_time: z.string(),
  role: z.enum(['fleet_commander', 'wing_commander', 'squad_commander', 'squad_member']),
  role_name: z.string(),
  ship_type_id: z.number(),
  solar_system_id: z.number(),
  squad_id: z.number(),
  station_id: z.number().optional(),
  takes_fleet_warp: z.boolean(),
  wing_id: z.number(),
});

export const FleetMembersSchema = z.array(FleetMemberSchema);

export type CharacterPublic = z.infer<typeof CharacterPublicSchema>;
export type CorporationPublic = z.infer<typeof CorporationPublicSchema>;
export type AlliancePublic = z.infer<typeof AlliancePublicSchema>;
export type CharacterAffiliation = z.infer<typeof CharacterAffiliationSchema>;
export type SystemKills = z.infer<typeof SystemKillsSchema>;
export type KillmailDetail = z.infer<typeof KillmailDetailSchema>;
export type CharacterLocation = z.infer<typeof CharacterLocationSchema>;
export type CharacterOnline = z.infer<typeof CharacterOnlineSchema>;
export type CharacterShip = z.infer<typeof CharacterShipSchema>;
export type CharacterFleetInfo = z.infer<typeof CharacterFleetInfoSchema>;
export type FleetMember = z.infer<typeof FleetMemberSchema>;
export type FleetMembers = z.infer<typeof FleetMembersSchema>;
