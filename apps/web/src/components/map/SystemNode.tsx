import { useState } from 'react';
import { motion } from 'framer-motion';
import { Constellation, type PochvenSystem } from '@monipoch/shared';
import { useMapStore } from '../../stores/map';

interface Props {
  system: PochvenSystem;
  x: number;
  y: number;
  kills: number;
  hasFight: boolean;
}

const CONSTELLATION_COLORS: Record<Constellation, string> = {
  [Constellation.KRAI_PERUN]: '#d4943a',
  [Constellation.KRAI_SVAROG]: '#c43c3c',
  [Constellation.KRAI_VELES]: '#b84c8a',
};

function getHeatColor(kills: number): string {
  if (kills === 0) return '#2a1a1a';
  if (kills <= 2) return '#2d4a1e';
  if (kills <= 5) return '#6b6b00';
  if (kills <= 10) return '#b35900';
  if (kills <= 20) return '#cc2200';
  return '#ff0040';
}

function getNodeRadius(kills: number, systemType: string): number {
  const base = systemType === 'home' ? 14 : systemType === 'border' ? 13 : 11;
  if (kills === 0) return base;
  if (kills <= 5) return base + 2;
  if (kills <= 15) return base + 4;
  return base + 6;
}

export default function SystemNode({ system, x, y, kills, hasFight }: Props) {
  const selectSystem = useMapStore((s) => s.selectSystem);
  const selectedSystemId = useMapStore((s) => s.selectedSystemId);
  const isSelected = selectedSystemId === system.systemId;
  const [isHovered, setIsHovered] = useState(false);

  const heatColor = getHeatColor(kills);
  const radius = getNodeRadius(kills, system.systemType);
  const constellationColor = CONSTELLATION_COLORS[system.constellation];
  const isHome = system.systemType === 'home';
  const isBorder = system.systemType === 'border';

  const effectiveHover = isHovered && !isSelected;

  return (
    <g
      onClick={() => selectSystem(isSelected ? null : system.systemId)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      className="cursor-pointer"
    >
      {!hasFight && (
        <circle
          cx={x}
          cy={y}
          r={radius + 3}
          fill="transparent"
          stroke={constellationColor}
          strokeOpacity={0.1}
          strokeWidth={1}
        >
          <animate attributeName="r" values={`${radius + 3};${radius + 5};${radius + 3}`} dur="4s" repeatCount="indefinite" />
        </circle>
      )}

      {!hasFight && isBorder && (
        <motion.circle
          cx={x}
          cy={y}
          r={radius + 6}
          fill="none"
          stroke={constellationColor}
          strokeWidth={0.5}
          strokeOpacity={0.25}
          strokeDasharray="2 2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        />
      )}

      {/* Home system inner diamond indicator */}
      {isHome && (
        <motion.rect
          x={x - radius * 0.5}
          y={y - radius * 0.5}
          width={radius}
          height={radius}
          rx={2}
          fill="none"
          stroke={constellationColor}
          strokeWidth={1}
          strokeOpacity={0.5}
          transform={`rotate(45, ${x}, ${y})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        />
      )}

      {/* Main node */}
      <motion.circle
        cx={x}
        cy={y}
        fill={heatColor}
        stroke={isSelected ? '#ffffff' : constellationColor}
        strokeWidth={isSelected ? 2 : isHome ? 1.5 : 1}
        filter={kills > 5 ? 'url(#glow-small)' : undefined}
        initial={{ r: 0 }}
        animate={{
          r: effectiveHover ? radius * 1.15 : radius,
          strokeOpacity: isSelected ? 1 : effectiveHover ? 1 : isHome ? 0.6 : 0.4,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      />

      {/* Kill count badge */}
      {kills > 0 && (
        <motion.text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray text-[10px] pointer-events-none select-none"
          style={{ fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
          fill="#c0c0c0"
          fillOpacity={0.85}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {kills}
        </motion.text>
      )}

      {/* System name */}
      <motion.text
        x={x}
        y={y + radius + 13}
        textAnchor="middle"
        className="fill-gray-400 text-[10px] pointer-events-none select-none"
        style={{ fontWeight: 400 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        whileHover={{ opacity: 1 }}
      >
        {system.name}
      </motion.text>

      {/* System type label for home systems */}
      {isHome && (
        <motion.text
          x={x}
          y={y + radius + 23}
          textAnchor="middle"
          className="text-[7px] pointer-events-none select-none"
          fill={constellationColor}
          fillOpacity={0.5}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          HOME
        </motion.text>
      )}
    </g>
  );
}
