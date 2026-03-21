import { memo, useState, useCallback, useLayoutEffect, useEffect, useRef, useMemo } from 'react';
import type { PilotPresence } from '@monipoch/shared';

interface Props {
  pilots: PilotPresence[];
  x: number;
  y: number;
  nodeRadius: number;
  onPilotHover?: (pilot: PilotPresence, svgX: number, svgY: number) => void;
  onPilotLeave?: () => void;
}

export const PILOT_PORTRAIT_R = 9;
const MAX_VISIBLE = 5;
const ARC_GAP = 8;
const FADE_MS = 800;

const ROLE_COLORS: Record<string, string> = {
  fleet_commander: '#f59e0b',
  wing_commander: '#3b82f6',
  squad_commander: '#8b5cf6',
  squad_member: '#6b7280',
};

export const PILOT_ROLE_LABELS: Record<string, string> = {
  fleet_commander: 'FC',
  wing_commander: 'WC',
  squad_commander: 'SC',
};

export const PILOT_ROLE_COLORS = ROLE_COLORS;

interface Ghost {
  pilot: PilotPresence;
  px: number;
  py: number;
  uid: string;
  createdAt: number;
}

function PilotPresenceIndicator({ pilots, x, y, nodeRadius, onPilotHover, onPilotLeave }: Props) {
  const instanceId = useRef(`ppi-${Math.random().toString(36).slice(2, 8)}`).current;
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const prevRef = useRef(new Map<number, { pilot: PilotPresence; px: number; py: number }>());
  const mountedRef = useRef(false);
  const enterAnimIds = useRef(new Set<number>());

  const arcR = nodeRadius + ARC_GAP + PILOT_PORTRAIT_R;
  const baseAng = -Math.PI / 2;
  const spread = Math.PI * 0.6;

  const vis = useMemo(() => pilots.slice(0, MAX_VISIBLE), [pilots]);

  const posMap = useMemo(() => {
    const m = new Map<number, { px: number; py: number }>();
    for (let i = 0; i < vis.length; i++) {
      const ang =
        vis.length === 1
          ? baseAng
          : baseAng - spread / 2 + (spread / (vis.length - 1)) * i;
      m.set(vis[i].characterId, {
        px: x + Math.cos(ang) * arcR,
        py: y + Math.sin(ang) * arcR,
      });
    }
    return m;
  }, [vis, x, y, arcR, baseAng, spread]);

  // Mark new pilots for enter animation (idempotent — safe in render phase)
  if (mountedRef.current) {
    for (const p of vis) {
      if (!prevRef.current.has(p.characterId)) {
        enterAnimIds.current.add(p.characterId);
      }
    }
  }

  // Runs BEFORE browser paint — ghosts appear in the same visual frame
  useLayoutEffect(() => {
    if (mountedRef.current) {
      const curIds = new Set(pilots.map((p) => p.characterId));
      const departed: Ghost[] = [];
      const now = Date.now();
      for (const [id, data] of prevRef.current) {
        if (!curIds.has(id)) {
          departed.push({ ...data, uid: `${id}-${now}`, createdAt: now });
        }
      }
      if (departed.length > 0) {
        setGhosts((g) => [...g, ...departed]);
      }
    }

    // Prune stale enter animation IDs
    const currentIds = new Set(vis.map((p) => p.characterId));
    for (const id of enterAnimIds.current) {
      if (!currentIds.has(id)) enterAnimIds.current.delete(id);
    }

    const next = new Map<number, { pilot: PilotPresence; px: number; py: number }>();
    for (const p of vis) {
      const pos = posMap.get(p.characterId);
      if (pos) next.set(p.characterId, { pilot: p, ...pos });
    }
    prevRef.current = next;
    mountedRef.current = true;
  }, [pilots, posMap, vis]);

  useEffect(() => {
    if (ghosts.length === 0) return;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - FADE_MS;
      setGhosts((g) => g.filter((gh) => gh.createdAt > cutoff));
    }, FADE_MS + 100);
    return () => clearTimeout(timer);
  }, [ghosts]);

  const handleEnter = useCallback(
    (pilot: PilotPresence, svgX: number, svgY: number) => {
      onPilotHover?.(pilot, svgX, svgY - PILOT_PORTRAIT_R - 30);
    },
    [onPilotHover],
  );

  const overflow = pilots.length - MAX_VISIBLE;
  const anyVisible = vis.length > 0 || ghosts.length > 0;

  if (!anyVisible) return null;

  return (
    <g>
      {ghosts.map((g) => (
        <g key={g.uid} className="pointer-events-none pilot-leave">
          <PilotCircle pilot={g.pilot} px={g.px} py={g.py} uid={instanceId} suffix={`g-${g.uid}`} />
        </g>
      ))}

      {vis.map((pilot) => {
        const pos = posMap.get(pilot.characterId);
        if (!pos) return null;
        const shouldAnimate = enterAnimIds.current.has(pilot.characterId);
        return (
          <g
            key={pilot.characterId}
            className={`cursor-pointer${shouldAnimate ? ' pilot-enter' : ''}`}
            onPointerEnter={() => handleEnter(pilot, pos.px, pos.py)}
            onPointerLeave={onPilotLeave}
          >
            <circle
              cx={pos.px}
              cy={pos.py}
              r={PILOT_PORTRAIT_R + 3}
              fill="transparent"
              className="pointer-events-auto"
            />
            <PilotCircle pilot={pilot} px={pos.px} py={pos.py} uid={instanceId} />
          </g>
        );
      })}

      {overflow > 0 &&
        (() => {
          const ang = baseAng + spread / 2 + 0.3;
          const px = x + Math.cos(ang) * arcR;
          const py = y + Math.sin(ang) * arcR;
          return (
            <g>
              <circle cx={px} cy={py} r={8} fill="#1a1a2e" stroke="#4ade80" strokeWidth={1} opacity={0.8} />
              <text x={px} y={py} textAnchor="middle" dominantBaseline="central" fill="#4ade80" fontSize={8} fontWeight={700}>
                +{overflow}
              </text>
            </g>
          );
        })()}

      <circle
        cx={x}
        cy={y}
        r={nodeRadius + 2}
        fill="none"
        stroke="#4ade80"
        strokeWidth={0.8}
        strokeOpacity={0.3}
        strokeDasharray="3 3"
        className="pointer-events-none"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${x} ${y}`}
          to={`360 ${x} ${y}`}
          dur="20s"
          repeatCount="indefinite"
        />
      </circle>
    </g>
  );
}

function PilotCircle({
  pilot,
  px,
  py,
  uid,
  suffix,
}: {
  pilot: PilotPresence;
  px: number;
  py: number;
  uid: string;
  suffix?: string;
}) {
  const clipId = `${uid}-${suffix ?? pilot.characterId}`;
  const border = pilot.fleetRole ? (ROLE_COLORS[pilot.fleetRole] ?? '#4ade80') : '#4ade80';
  const portrait = `https://images.evetech.net/characters/${pilot.characterId}/portrait?size=32`;

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <circle cx={px} cy={py} r={PILOT_PORTRAIT_R - 1} />
        </clipPath>
      </defs>
      <circle cx={px} cy={py} r={PILOT_PORTRAIT_R} fill="#111" stroke={border} strokeWidth={1.5} opacity={0.95} />
      <image
        href={portrait}
        x={px - PILOT_PORTRAIT_R + 1}
        y={py - PILOT_PORTRAIT_R + 1}
        width={(PILOT_PORTRAIT_R - 1) * 2}
        height={(PILOT_PORTRAIT_R - 1) * 2}
        clipPath={`url(#${clipId})`}
        opacity={0.9}
      />
      {pilot.fleetRole === 'fleet_commander' && (
        <polygon
          points={`${px},${py - PILOT_PORTRAIT_R - 4} ${px - 3},${py - PILOT_PORTRAIT_R - 1} ${px + 3},${py - PILOT_PORTRAIT_R - 1}`}
          fill="#f59e0b"
          opacity={0.9}
        />
      )}
    </>
  );
}

export default memo(PilotPresenceIndicator);
