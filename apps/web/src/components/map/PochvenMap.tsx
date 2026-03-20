import { forwardRef, useMemo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PochvenSystem, DetectedFight } from '@monipoch/shared';
import { Constellation } from '@monipoch/shared';
import SystemNode from './SystemNode';
import ConnectionLine from './ConnectionLine';
import FightIndicator from './FightIndicator';
import CampIndicator, { type GateCampData } from './CampIndicator';
import RoamIndicator, { type RoamingFleetData } from './RoamIndicator';
import { computeLayout, V } from './layout';
import { useMapStore, type TimeWindow } from '../../stores/map';
import { useCollisionEngine, type LabelDescriptor, type StaticObstacle } from '../../hooks/useCollisionEngine';

interface Props {
  systems: PochvenSystem[];
  connections: [string, string][];
  heatmap: Record<number, { kills1h: number; kills6h: number; kills24h: number }>;
  activeFights: DetectedFight[];
  activeCamps: GateCampData[];
  activeRoams: RoamingFleetData[];
  timeWindow: TimeWindow;
}

const CONSTELLATION_COLORS: Record<Constellation, string> = {
  [Constellation.KRAI_PERUN]: '#d4943a',
  [Constellation.KRAI_SVAROG]: '#c43c3c',
  [Constellation.KRAI_VELES]: '#b84c8a',
};

const EDGE_LABELS: { label: string; color: string; x: number; y: number; rotate: number }[] = [
  { label: 'PERUN', color: CONSTELLATION_COLORS[Constellation.KRAI_PERUN], x: 365, y: 225, rotate: -56 },
  { label: 'VELES', color: CONSTELLATION_COLORS[Constellation.KRAI_VELES], x: 185, y: 497, rotate: -56 },
  { label: 'PERUN', color: CONSTELLATION_COLORS[Constellation.KRAI_PERUN], x: 635, y: 225, rotate: 56 },
  { label: 'SVAROG', color: CONSTELLATION_COLORS[Constellation.KRAI_SVAROG], x: 815, y: 497, rotate: 56 },
  { label: 'VELES', color: CONSTELLATION_COLORS[Constellation.KRAI_VELES], x: 320, y: 715, rotate: 0 },
  { label: 'SVAROG', color: CONSTELLATION_COLORS[Constellation.KRAI_SVAROG], x: 680, y: 715, rotate: 0 },
];

const DRIFT_SPEED = 0.00004;
const DRIFT_RADIUS = 8;
const TRI_CENTER = { x: (500 + 134 + 866) / 3, y: (120 + 660 + 660) / 3 };
const LABEL_DISTANCE = 55;
const FIGHT_ISK_THRESHOLD = 500_000_000;
const COLLISION_MULTIPLIER = 1.8;
const LABEL_H = 14;
const CHAR_W_FIGHT = 3.8;
const CHAR_W_CAMP = 3.6;
const CHAR_W_ROAM = 3.4;
const LABEL_PAD = 10;

function getNodeRadius(kills: number, systemType: string): number {
  const base = systemType === 'home' ? 14 : systemType === 'border' ? 13 : 11;
  if (kills === 0) return base;
  if (kills <= 5) return base + 2;
  if (kills <= 15) return base + 4;
  return base + 6;
}

function outwardOffset(nodeX: number, nodeY: number) {
  const dx = nodeX - TRI_CENTER.x;
  const dy = nodeY - TRI_CENTER.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { ox: (dx / len) * LABEL_DISTANCE, oy: (dy / len) * LABEL_DISTANCE };
}

const PochvenMap = forwardRef<SVGSVGElement, Props>(function PochvenMap(
  { systems, connections, heatmap, activeFights, activeCamps, activeRoams, timeWindow },
  ref,
) {
  const positions = useMemo(() => computeLayout(systems), [systems]);

  const fightSystems = useMemo(
    () => new Set(activeFights.map((f) => f.systemId)),
    [activeFights],
  );

  const { resolve, setObstacles } = useCollisionEngine();

  const staticObstacles = useMemo<StaticObstacle[]>(() => {
    const obs: StaticObstacle[] = [];
    for (const sys of systems) {
      const pos = positions.get(sys.name);
      if (!pos) continue;
      const r = sys.systemType === 'home' ? 16 : sys.systemType === 'border' ? 15 : 13;
      obs.push({ cx: pos.x, cy: pos.y, hw: r + 4, hh: r + 4 });
      obs.push({ cx: pos.x, cy: pos.y + r + 13, hw: 28, hh: 7 });
    }
    return obs;
  }, [systems, positions]);

  useEffect(() => {
    setObstacles(staticObstacles);
  }, [staticObstacles, setObstacles]);

  const visibleFights = useMemo(
    () => activeFights.filter((f) => f.totalIskDestroyed > FIGHT_ISK_THRESHOLD),
    [activeFights],
  );

  const allLabels = useMemo<LabelDescriptor[]>(() => {
    const labels: LabelDescriptor[] = [];

    for (const fight of visibleFights) {
      const pos = positions.get(fight.systemName);
      if (!pos) continue;
      const { ox, oy } = outwardOffset(pos.x, pos.y);
      const text = `${fight.totalKills} ${fight.totalKills > 1 ? 'KILLS' : 'KILL'} · ${Math.round(fight.totalIskDestroyed / 1_000_000)}M ISK`;
      const visualW = text.length * CHAR_W_FIGHT + LABEL_PAD;
      labels.push({ id: `fight-${fight.id}`, baseX: pos.x + ox, baseY: pos.y + oy, width: visualW * COLLISION_MULTIPLIER, height: LABEL_H * COLLISION_MULTIPLIER });
    }

    for (const camp of activeCamps) {
      const sys = systems.find((s) => s.systemId === camp.currentSystemId);
      if (!sys) continue;
      const pos = positions.get(sys.name);
      if (!pos) continue;
      const { ox, oy } = outwardOffset(pos.x, pos.y);
      const shortGate = camp.anchorGateName?.replace(/^Stargate\s*\((.+)\)$/, '$1') ?? null;
      const gatePart = shortGate ? ` @ ${shortGate}` : '';
      const text = `CAMP${gatePart} · ${camp.killCount}k · now`;
      const visualW = text.length * CHAR_W_CAMP + LABEL_PAD;
      labels.push({ id: `camp-${camp.id}`, baseX: pos.x + ox, baseY: pos.y + oy, width: visualW * COLLISION_MULTIPLIER, height: LABEL_H * COLLISION_MULTIPLIER });
    }

    for (const roam of activeRoams) {
      const hist = roam.systemHistory ?? [];
      if (hist.length === 0) continue;
      const lastSys = systems.find((s) => s.systemId === hist[hist.length - 1].systemId);
      if (!lastSys) continue;
      const pos = positions.get(lastSys.name);
      if (!pos) continue;
      const { ox, oy } = outwardOffset(pos.x, pos.y);
      const nextArrow = (roam.predictedNext ?? []).length > 0 ? ` > ${roam.predictedNext[0]}` : '';
      const text = `ROAM ${hist.length} sys · now${nextArrow}`;
      const visualW = text.length * CHAR_W_ROAM + LABEL_PAD;
      labels.push({ id: `roam-${roam.id}`, baseX: pos.x + ox, baseY: pos.y + oy, width: visualW * COLLISION_MULTIPLIER, height: LABEL_H * COLLISION_MULTIPLIER });
    }

    return labels;
  }, [visibleFights, activeCamps, activeRoams, systems, positions]);

  const [collisionOffsets, setCollisionOffsets] = useState(new Map<string, { dx: number; dy: number }>());
  const collisionRaf = useRef(0);
  const lastResolveRef = useRef(0);
  const driftsRef = useRef(new Map<string, { dx: number; dy: number }>());
  const phasesRef = useRef(new Map<string, number>());

  useEffect(() => {
    const validIds = new Set(allLabels.map((l) => l.id));
    for (const l of allLabels) {
      if (!phasesRef.current.has(l.id)) phasesRef.current.set(l.id, Math.random() * Math.PI * 2);
    }
    for (const key of phasesRef.current.keys()) {
      if (!validIds.has(key)) phasesRef.current.delete(key);
    }
    for (const key of driftsRef.current.keys()) {
      if (!validIds.has(key)) driftsRef.current.delete(key);
    }
  }, [allLabels]);

  useEffect(() => {
    const RESOLVE_INTERVAL = 100;

    function tick() {
      const now = Date.now();
      const t = now * DRIFT_SPEED;
      const drifts = driftsRef.current;

      for (const l of allLabels) {
        const phase = phasesRef.current.get(l.id) ?? 0;
        let entry = drifts.get(l.id);
        if (!entry) { entry = { dx: 0, dy: 0 }; drifts.set(l.id, entry); }
        entry.dx = Math.sin(t + phase) * DRIFT_RADIUS;
        entry.dy = Math.cos(t * 0.7 + phase) * DRIFT_RADIUS * 0.6;
      }

      if (now - lastResolveRef.current >= RESOLVE_INTERVAL) {
        lastResolveRef.current = now;
        const resolved = resolve(allLabels, drifts);
        setCollisionOffsets((prev) => {
          if (prev.size === 0 && resolved.size === 0) return prev;
          let changed = prev.size !== resolved.size;
          if (!changed) {
            for (const [k, v] of resolved) {
              const p = prev.get(k);
              if (!p || Math.abs(p.dx - v.dx) > 0.1 || Math.abs(p.dy - v.dy) > 0.1) {
                changed = true;
                break;
              }
            }
          }
          return changed ? new Map(resolved) : prev;
        });
      }

      collisionRaf.current = requestAnimationFrame(tick);
    }
    collisionRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(collisionRaf.current);
  }, [allLabels, resolve]);

  function getKillCount(systemId: number): number {
    const data = heatmap[systemId];
    if (!data) return 0;
    switch (timeWindow) {
      case '1h': return data.kills1h;
      case '6h': return data.kills6h;
      case '24h': return data.kills24h;
      case '7d': return data.kills24h * 7;
    }
  }

  return (
    <motion.svg
      ref={ref}
      viewBox="0 0 1000 750"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full max-h-[calc(100vh-3rem)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <defs>
        <radialGradient id="bg-gradient" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#0e0808" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#080505" stopOpacity="0" />
        </radialGradient>
        <filter id="glow-small">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-large">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        width="1000"
        height="750"
        fill="url(#bg-gradient)"
        onClick={() => {
          useMapStore.getState().selectSystem(null);
          useMapStore.getState().selectTactical(null);
        }}
      />

      {/* Triangle outline */}
      <motion.polygon
        points={`${V.top.x},${V.top.y} ${V.bottomLeft.x},${V.bottomLeft.y} ${V.bottomRight.x},${V.bottomRight.y}`}
        fill="none"
        stroke="#ff9999"
        strokeWidth={0.5}
        strokeOpacity={0.06}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2 }}
      />

      {/* Constellation labels along half-edges */}
      {EDGE_LABELS.map(({ label, color, x, y, rotate }, i) => (
        <text
          key={i}
          x={x}
          y={y}
          textAnchor="middle"
          transform={`rotate(${rotate}, ${x}, ${y})`}
          className="text-[9px] font-bold tracking-[0.25em] pointer-events-none select-none"
          fill={color}
          fillOpacity={0.12}
        >
          {label}
        </text>
      ))}

      {/* Connection lines */}
      {connections.map(([from, to]) => {
        const p1 = positions.get(from);
        const p2 = positions.get(to);
        if (!p1 || !p2) return null;

        const sysFrom = systems.find((s) => s.name === from);
        const sysTo = systems.find((s) => s.name === to);
        const isInterConstellation = sysFrom?.constellation !== sysTo?.constellation;
        const involvesHome = sysFrom?.systemType === 'home' || sysTo?.systemType === 'home';

        return (
          <ConnectionLine
            key={`${from}-${to}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            isConduit={isInterConstellation}
            isHomeLink={involvesHome}
          />
        );
      })}

      {/* Fight indicators — ring for all, label only for >500M ISK */}
      {activeFights.map((fight) => {
        const sys = systems.find((s) => s.systemId === fight.systemId);
        const pos = positions.get(fight.systemName);
        if (!pos || !sys) return null;
        const hasLabel = fight.totalIskDestroyed > FIGHT_ISK_THRESHOLD;
        const { ox, oy } = outwardOffset(pos.x, pos.y);
        const nr = getNodeRadius(getKillCount(fight.systemId), sys.systemType);
        return (
          <FightIndicator
            key={fight.id}
            x={pos.x}
            y={pos.y}
            nodeRadius={nr}
            labelBaseX={pos.x + ox}
            labelBaseY={pos.y + oy}
            fight={fight}
            showLabel={hasLabel}
          />
        );
      })}

      {/* Gate camp indicators */}
      {activeCamps.map((camp) => {
        const sys = systems.find((s) => s.systemId === camp.currentSystemId);
        if (!sys) return null;
        const pos = positions.get(sys.name);
        if (!pos) return null;
        const { ox, oy } = outwardOffset(pos.x, pos.y);
        return (
          <CampIndicator
            key={`camp-${camp.id}`}
            x={pos.x}
            y={pos.y}
            labelBaseX={pos.x + ox}
            labelBaseY={pos.y + oy}
            camp={camp}
            collisionOffset={collisionOffsets.get(`camp-${camp.id}`)}
          />
        );
      })}

      {/* Roaming fleet indicators */}
      {activeRoams.map((roam) => {
        const hist = roam.systemHistory ?? [];
        if (hist.length === 0) return null;
        const lastSys = systems.find((s) => s.systemId === hist[hist.length - 1].systemId);
        if (!lastSys) return null;
        const pos = positions.get(lastSys.name);
        if (!pos) return null;
        const { ox, oy } = outwardOffset(pos.x, pos.y);
        return (
          <RoamIndicator
            key={`roam-${roam.id}`}
            x={pos.x}
            y={pos.y}
            labelBaseX={pos.x + ox}
            labelBaseY={pos.y + oy}
            roam={roam}
            collisionOffset={collisionOffsets.get(`roam-${roam.id}`)}
          />
        );
      })}

      {/* System nodes */}
      {systems.map((sys) => {
        const pos = positions.get(sys.name);
        if (!pos) return null;
        return (
          <SystemNode
            key={sys.systemId}
            system={sys}
            x={pos.x}
            y={pos.y}
            kills={getKillCount(sys.systemId)}
            hasFight={fightSystems.has(sys.systemId)}
          />
        );
      })}
    </motion.svg>
  );
});

export default PochvenMap;
