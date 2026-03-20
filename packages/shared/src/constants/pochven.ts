export const POCHVEN_REGION_ID = 10000070;

export enum Constellation {
  KRAI_PERUN = 'krai_perun',
  KRAI_SVAROG = 'krai_svarog',
  KRAI_VELES = 'krai_veles',
}

export type SystemType = 'home' | 'border' | 'internal' | 'external';

export interface PochvenSystem {
  systemId: number;
  name: string;
  constellation?: Constellation;
  securityClass: string;
  systemType: SystemType;
}

// All system IDs verified via ESI 2026-03-19
export const POCHVEN_SYSTEMS: PochvenSystem[] = [
  // Krai Perun (constellation 20000787)
  { systemId: 30005005, name: 'Ignebaener', constellation: Constellation.KRAI_PERUN, securityClass: 'D1', systemType: 'internal' },
  { systemId: 30001372, name: 'Kino',       constellation: Constellation.KRAI_PERUN, securityClass: 'C',  systemType: 'home' },
  { systemId: 30031392, name: 'Komo',       constellation: Constellation.KRAI_PERUN, securityClass: 'A',  systemType: 'internal' },
  { systemId: 30002737, name: 'Konola',     constellation: Constellation.KRAI_PERUN, securityClass: 'C',  systemType: 'internal' },
  { systemId: 30002079, name: 'Krirald',    constellation: Constellation.KRAI_PERUN, securityClass: 'E1', systemType: 'internal' },
  { systemId: 30001445, name: 'Nalvula',    constellation: Constellation.KRAI_PERUN, securityClass: 'C1', systemType: 'internal' },
  { systemId: 30000192, name: 'Otanuomi',   constellation: Constellation.KRAI_PERUN, securityClass: 'C1', systemType: 'border' },
  { systemId: 30000157, name: 'Otela',      constellation: Constellation.KRAI_PERUN, securityClass: 'C',  systemType: 'internal' },
  { systemId: 30010141, name: 'Sakenta',    constellation: Constellation.KRAI_PERUN, securityClass: 'A',  systemType: 'border' },

  // Krai Svarog (constellation 20000788)
  { systemId: 30045328, name: 'Ahtila',     constellation: Constellation.KRAI_SVAROG, securityClass: 'A',  systemType: 'border' },
  { systemId: 30002225, name: 'Harva',      constellation: Constellation.KRAI_SVAROG, securityClass: 'B',  systemType: 'internal' },
  { systemId: 30000021, name: 'Kuharah',    constellation: Constellation.KRAI_SVAROG, securityClass: 'B3', systemType: 'internal' },
  { systemId: 30001413, name: 'Nani',       constellation: Constellation.KRAI_SVAROG, securityClass: 'B',  systemType: 'internal' },
  { systemId: 30003504, name: 'Niarja',     constellation: Constellation.KRAI_SVAROG, securityClass: 'B1', systemType: 'home' },
  { systemId: 30003495, name: 'Raravoss',   constellation: Constellation.KRAI_SVAROG, securityClass: 'B1', systemType: 'internal' },
  { systemId: 30002411, name: 'Skarkon',    constellation: Constellation.KRAI_SVAROG, securityClass: 'E1', systemType: 'internal' },
  { systemId: 30002770, name: 'Tunudan',    constellation: Constellation.KRAI_SVAROG, securityClass: 'C1', systemType: 'internal' },
  { systemId: 30040141, name: 'Urhinichi',  constellation: Constellation.KRAI_SVAROG, securityClass: 'A',  systemType: 'border' },

  // Krai Veles (constellation 20000789)
  { systemId: 30002652, name: 'Ala',        constellation: Constellation.KRAI_VELES, securityClass: 'D1', systemType: 'internal' },
  { systemId: 30003046, name: 'Angymonne',  constellation: Constellation.KRAI_VELES, securityClass: 'D1', systemType: 'internal' },
  { systemId: 30002702, name: 'Archee',     constellation: Constellation.KRAI_VELES, securityClass: 'D2', systemType: 'home' },
  { systemId: 30001381, name: 'Arvasaras',  constellation: Constellation.KRAI_VELES, securityClass: 'C',  systemType: 'border' },
  { systemId: 30045329, name: 'Ichoriya',   constellation: Constellation.KRAI_VELES, securityClass: 'C',  systemType: 'internal' },
  { systemId: 30002797, name: 'Kaunokka',   constellation: Constellation.KRAI_VELES, securityClass: 'C',  systemType: 'internal' },
  { systemId: 30020141, name: 'Senda',      constellation: Constellation.KRAI_VELES, securityClass: 'A',  systemType: 'border' },
  { systemId: 30005029, name: 'Vale',       constellation: Constellation.KRAI_VELES, securityClass: 'D1', systemType: 'internal' },
  { systemId: 30000206, name: 'Wirashoda',  constellation: Constellation.KRAI_VELES, securityClass: 'C',  systemType: 'internal' },
];

export const POCHVEN_SYSTEM_IDS = new Set(POCHVEN_SYSTEMS.map((s) => s.systemId));

export const POCHVEN_SYSTEM_BY_ID = new Map(
  POCHVEN_SYSTEMS.map((s) => [s.systemId, s]),
);

export const POCHVEN_SYSTEM_BY_NAME = new Map(
  POCHVEN_SYSTEMS.map((s) => [s.name.toLowerCase(), s]),
);

export const TABBETZUR: PochvenSystem = {
  systemId: 30003465,
  name: 'Tabbetzur',
  securityClass: 'L',
  systemType: 'external',
};

export const EXTRA_TRACKED_SYSTEMS: PochvenSystem[] = [TABBETZUR];

export const ALL_TRACKED_SYSTEM_IDS = new Set([
  ...POCHVEN_SYSTEM_IDS,
  ...EXTRA_TRACKED_SYSTEMS.map((s) => s.systemId),
]);

export const ALL_TRACKED_SYSTEM_BY_ID = new Map<number, PochvenSystem>([
  ...POCHVEN_SYSTEM_BY_ID,
  ...EXTRA_TRACKED_SYSTEMS.map((s) => [s.systemId, s] as const),
]);

/**
 * All stargate connections verified via ESI stargates endpoint 2026-03-19.
 * Pochven forms ONE continuous 27-system loop with 3 home-system bypasses.
 * Border systems connect adjacent constellations at triangle vertices.
 */
export const POCHVEN_CONNECTIONS: [string, string][] = [
  // Krai Perun main chain (Sakenta -> ... -> Otanuomi)
  ['Sakenta', 'Komo'],
  ['Komo', 'Ignebaener'],
  ['Ignebaener', 'Otela'],
  ['Otela', 'Nalvula'],       // home bypass (skips Kino)
  ['Nalvula', 'Konola'],
  ['Konola', 'Krirald'],
  ['Krirald', 'Otanuomi'],
  // Perun home system connections
  ['Otela', 'Kino'],
  ['Kino', 'Nalvula'],

  // Krai Svarog main chain (Urhinichi -> ... -> Ahtila)
  ['Urhinichi', 'Nani'],
  ['Nani', 'Skarkon'],
  ['Skarkon', 'Raravoss'],
  ['Raravoss', 'Harva'],      // home bypass (skips Niarja)
  ['Harva', 'Tunudan'],
  ['Tunudan', 'Kuharah'],
  ['Kuharah', 'Ahtila'],
  // Svarog home system connections
  ['Raravoss', 'Niarja'],
  ['Niarja', 'Harva'],

  // Krai Veles main chain (Senda -> ... -> Arvasaras)
  ['Senda', 'Wirashoda'],
  ['Wirashoda', 'Ala'],
  ['Ala', 'Vale'],
  ['Vale', 'Angymonne'],      // home bypass (skips Archee)
  ['Angymonne', 'Ichoriya'],
  ['Ichoriya', 'Kaunokka'],
  ['Kaunokka', 'Arvasaras'],
  // Veles home system connections
  ['Vale', 'Archee'],
  ['Archee', 'Angymonne'],

  // Inter-constellation border connections (triangle vertices)
  ['Otanuomi', 'Urhinichi'],  // Perun <-> Svarog (top vertex)
  ['Ahtila', 'Senda'],        // Svarog <-> Veles (bottom-right vertex)
  ['Arvasaras', 'Sakenta'],   // Veles <-> Perun (bottom-left vertex)
];

/**
 * Triangle layout matching the in-game Pochven map.
 * Home systems sit at the three vertices. Each edge is split between
 * two constellations with the conduit (inter-clade gate) at the midpoint.
 *
 * Left edge  (top→bottom-left): Perun upper, Veles lower
 * Right edge (top→bottom-right): Perun upper, Svarog lower
 * Bottom edge (left→right): Veles left, Svarog right
 */
export interface TriangleEdge {
  upperHalf: string[];
  lowerHalf: string[];
}

export const TRIANGLE_LAYOUT: {
  vertices: { top: string; bottomLeft: string; bottomRight: string };
  leftEdge: TriangleEdge;
  rightEdge: TriangleEdge;
  bottomEdge: TriangleEdge;
} = {
  vertices: { top: 'Kino', bottomLeft: 'Archee', bottomRight: 'Niarja' },
  leftEdge: {
    upperHalf: ['Otela', 'Ignebaener', 'Komo', 'Sakenta'],
    lowerHalf: ['Arvasaras', 'Kaunokka', 'Ichoriya', 'Angymonne'],
  },
  rightEdge: {
    upperHalf: ['Nalvula', 'Konola', 'Krirald', 'Otanuomi'],
    lowerHalf: ['Urhinichi', 'Nani', 'Skarkon', 'Raravoss'],
  },
  bottomEdge: {
    upperHalf: ['Vale', 'Ala', 'Wirashoda', 'Senda'],
    lowerHalf: ['Ahtila', 'Kuharah', 'Tunudan', 'Harva'],
  },
};
