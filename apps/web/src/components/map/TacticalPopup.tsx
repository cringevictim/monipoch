import { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, Shield, Navigation } from 'lucide-react';
import { useMapStore } from '../../stores/map';
import { useEsiNames } from '../../hooks/useEsiNames';
import type { GateCampData } from './CampIndicator';
import type { RoamingFleetData } from './RoamIndicator';
import type { FleetGroupCharacter } from './fleetTypes';

function evePortrait(id: number, size = 64) {
  return `https://images.evetech.net/characters/${id}/portrait?size=${size}`;
}
function eveCorpLogo(id: number, size = 32) {
  return `https://images.evetech.net/corporations/${id}/logo?size=${size}`;
}
function eveAllianceLogo(id: number, size = 32) {
  return `https://images.evetech.net/alliances/${id}/logo?size=${size}`;
}
function eveShipRender(id: number, size = 64) {
  return `https://images.evetech.net/types/${id}/render?size=${size}`;
}
function Shimmer({ w = 'w-20', h = 'h-3' }: { w?: string; h?: string }) {
  return <span className={`${w} ${h} rounded bg-white/10 animate-pulse inline-block`} />;
}

function timeAgo(d: string | number): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  tacticalId: string;
  camps: GateCampData[];
  roams: RoamingFleetData[];
  nodeX: number;
  nodeY: number;
  svgRect: DOMRect | null;
}

function getNodeRadius(): number {
  return 13;
}

export default function TacticalPopup({ tacticalId, camps, roams, nodeX, nodeY, svgRect }: Props) {
  const selectTactical = useMapStore((s) => s.selectTactical);
  const popupRef = useRef<HTMLDivElement>(null);

  const isCamp = tacticalId.startsWith('camp-');
  const rawId = tacticalId.replace(/^(camp|roam)-/, '');

  const camp = useMemo(() => (isCamp ? camps.find((c) => String(c.id) === rawId) ?? null : null), [isCamp, camps, rawId]);
  const roam = useMemo(() => (!isCamp ? roams.find((r) => r.id === rawId) ?? null : null), [isCamp, roams, rawId]);

  const group = camp ?? roam;
  const characters = group?.characters ?? [];

  const allIds = useMemo(() => {
    const ids: number[] = [];
    for (const c of characters.slice(0, 20)) {
      ids.push(c.characterId);
      if (c.corporationId) ids.push(c.corporationId);
      if (c.allianceId) ids.push(c.allianceId);
      if (c.shipTypeId) ids.push(c.shipTypeId);
    }
    return ids;
  }, [characters]);

  const { data: nameMap } = useEsiNames(allIds);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') selectTactical(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectTactical]);

  const driftRef = useRef(0);
  const [drift, setDrift] = useState({ dx: 0, dy: 0, gradAngle: 0 });
  useEffect(() => {
    const phase = Math.random() * Math.PI * 2;
    const gp1 = Math.random() * Math.PI * 2;
    const gp2 = Math.random() * Math.PI * 2;
    function tick() {
      const t = Date.now() * 0.0003;
      setDrift({
        dx: Math.sin(t + phase) * 5,
        dy: Math.cos(t * 0.7 + phase) * 3,
        gradAngle: Math.sin(t * 0.8 + gp1) * Math.PI + Math.cos(t * 0.5 + gp2) * Math.PI * 0.5,
      });
      driftRef.current = requestAnimationFrame(tick);
    }
    driftRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(driftRef.current);
  }, []);

  if (!svgRect || (!camp && !roam)) return null;

  const popupW = 440;
  const viewBoxW = 1000;
  const viewBoxH = 750;
  const svgAspect = viewBoxW / viewBoxH;
  const rectAspect = svgRect.width / svgRect.height;
  let renderW: number, renderH: number, renderX: number, renderY: number;
  if (rectAspect > svgAspect) {
    renderH = svgRect.height;
    renderW = renderH * svgAspect;
    renderX = svgRect.left + (svgRect.width - renderW) / 2;
    renderY = svgRect.top;
  } else {
    renderW = svgRect.width;
    renderH = renderW / svgAspect;
    renderX = svgRect.left;
    renderY = svgRect.top + (svgRect.height - renderH) / 2;
  }
  const sysScreenX = renderX + (nodeX / viewBoxW) * renderW;
  const sysScreenY = renderY + (nodeY / viewBoxH) * renderH;
  const scale = renderW / viewBoxW;
  const nodeScreenR = Math.max((getNodeRadius() + 2) * scale, 14);
  const hGap = nodeScreenR + 40;

  const accentColor = isCamp ? '#ef4444' : '#f59e0b';

  let left: number;
  let onRight = true;
  if (sysScreenX + hGap + popupW < window.innerWidth - 16) {
    left = sysScreenX + hGap;
  } else if (sysScreenX - hGap - popupW > 16) {
    left = sysScreenX - hGap - popupW;
    onRight = false;
  } else {
    left = Math.max(16, window.innerWidth - popupW - 16);
    onRight = left > sysScreenX;
  }

  let top = sysScreenY - 60;
  if (top < 50) top = 50;
  if (top + 460 > window.innerHeight - 16) top = window.innerHeight - 460 - 16;

  const popupEdgeX = onRight ? left : left + popupW;
  const popupEdgeY = Math.min(Math.max(sysScreenY, top + 20), top + 400);

  const lineId = `tac-conn-${tacticalId}`;
  const driftedEdgeX = popupEdgeX + drift.dx;
  const driftedEdgeY = popupEdgeY + drift.dy;
  const angle = Math.atan2(driftedEdgeY - sysScreenY, driftedEdgeX - sysScreenX);
  const lineStartX = sysScreenX + Math.cos(angle) * nodeScreenR;
  const lineStartY = sysScreenY + Math.sin(angle) * nodeScreenR;

  const systemName = group?.systemName ?? 'Unknown';

  return (
    <>
      <motion.svg
        className="fixed inset-0 pointer-events-none z-40"
        style={{ width: '100vw', height: '100vh', background: 'none' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <defs>
          <linearGradient id={lineId} x1={lineStartX} y1={lineStartY} x2={driftedEdgeX} y2={driftedEdgeY} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <line x1={lineStartX} y1={lineStartY} x2={driftedEdgeX} y2={driftedEdgeY} stroke={`url(#${lineId})`} strokeWidth={1.5} />
      </motion.svg>

      <motion.div
        ref={popupRef}
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="fixed z-50 rounded-lg overflow-visible"
        style={{ left, top, width: popupW }}
      >
        <svg
          className="absolute pointer-events-none z-10"
          style={{ top: -1, left: -1, width: popupW + 2, height: '100%', overflow: 'visible', background: 'none' }}
        >
          <defs>
            <linearGradient
              id={`${lineId}-outline`}
              x1={`${50 + Math.cos(drift.gradAngle) * 50}%`}
              y1={`${50 + Math.sin(drift.gradAngle) * 50}%`}
              x2={`${50 - Math.cos(drift.gradAngle) * 50}%`}
              y2={`${50 - Math.sin(drift.gradAngle) * 50}%`}
            >
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.45" />
              <stop offset="100%" stopColor="#9ca3af" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <rect x="0.5" y="0.5" rx="8" ry="8" width={popupW + 1} height="100%" stroke={`url(#${lineId}-outline)`} strokeWidth="1.5" fill="none" />
        </svg>

        <div className="rounded-lg overflow-hidden bg-pochven-surface/95 backdrop-blur-xl shadow-2xl relative z-20">
          {/* Header */}
          <div className="px-3 py-1.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${accentColor}30` }}>
            <div className="flex items-center gap-2 min-w-0">
              {isCamp ? <Shield className="h-4 w-4 flex-shrink-0" style={{ color: accentColor }} /> : <Navigation className="h-4 w-4 flex-shrink-0" style={{ color: accentColor }} />}
              <span className="text-sm font-bold truncate" style={{ color: accentColor }}>
                {isCamp ? 'Gate Camp' : 'Roaming Fleet'}
              </span>
              <span className="text-xs text-gray-500 flex-shrink-0">{systemName}</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); selectTactical(null); }} className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Info + timing */}
          <div className="px-4 py-3 border-b border-pochven-border/50">
            {isCamp && camp && <CampMeta camp={camp} />}
            {!isCamp && roam && <RoamMeta roam={roam} />}
          </div>

          {/* Players section */}
          <div className="px-4 py-3">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
              Players ({characters.length})
            </span>
            {characters.length === 0 ? (
              <div className="text-xs text-gray-600 py-4 text-center">No player data yet</div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto space-y-1 mt-2 pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                {characters.slice(0, 20).map((p) => (
                  <PlayerRow
                    key={p.characterId}
                    char={p}
                    nameMap={nameMap}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function PlayerRow({
  char: p,
  nameMap,
}: {
  char: FleetGroupCharacter;
  nameMap?: Map<number, string>;
}) {
  const charName = nameMap?.get(p.characterId);
  const corpName = p.corporationId ? nameMap?.get(p.corporationId) : undefined;
  const allianceName = p.allianceId ? nameMap?.get(p.allianceId) : undefined;
  const shipName = p.shipTypeId ? nameMap?.get(p.shipTypeId) : undefined;

  return (
    <div className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-white/5 transition-colors">
      <img
        src={evePortrait(p.characterId)}
        alt=""
        className="w-10 h-10 rounded-full flex-shrink-0 bg-black/30"
        loading="lazy"
      />

      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-200 font-medium truncate block">
          {charName ?? <Shimmer w="w-24" h="h-4" />}
        </span>
        {p.corporationId && (
          <div className="flex items-center gap-1 mt-0.5">
            <img
              src={eveCorpLogo(p.corporationId)}
              alt=""
              className="w-4 h-4 rounded-sm flex-shrink-0"
              loading="lazy"
            />
            {corpName ? (
              <span className="text-xs text-gray-500 truncate">{corpName}</span>
            ) : (
              <Shimmer w="w-28" />
            )}
          </div>
        )}
        {p.allianceId && (
          <div className="flex items-center gap-1 mt-0.5">
            <img
              src={eveAllianceLogo(p.allianceId)}
              alt=""
              className="w-4 h-4 rounded-sm flex-shrink-0"
              loading="lazy"
            />
            {allianceName ? (
              <span className="text-xs text-gray-500 truncate">{allianceName}</span>
            ) : (
              <Shimmer w="w-32" />
            )}
          </div>
        )}
      </div>

      {p.shipTypeId && (
        <div className="flex flex-col items-center flex-shrink-0">
          <img
            src={eveShipRender(p.shipTypeId)}
            alt={shipName ?? ''}
            title={shipName ?? undefined}
            className="w-10 h-10 rounded bg-black/30"
            loading="lazy"
          />
          {shipName && (
            <span className="text-[10px] text-gray-600 truncate w-12 text-center mt-0.5 leading-tight">
              {shipName}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CampMeta({ camp }: { camp: GateCampData }) {
  return (
    <div className="space-y-2">
      <div className="min-w-0">
        <span className="text-sm text-gray-200 font-medium">{camp.systemName}</span>
        
        <div className="flex items-center gap-2 text-xs text-gray-500">
        {camp.anchorGateName && (
          <>
            <span>{camp.anchorGateName}</span>
            <span>&middot;</span>
          </>
        )}
          <span>{camp.killCount} kills</span>
          <span>&middot;</span>
          <span>{camp.characters.length} players</span>
          <span>&middot;</span>
          <span>{camp.shipTypes.length} ship {camp.shipTypes.length > 1 ? 'types' : 'type'}</span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>First: {timeAgo(camp.firstSeenAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Last: {timeAgo(camp.lastKillAt)}</span>
        </div>
      </div>
    </div>
  );
}

function RoamMeta({ roam }: { roam: RoamingFleetData }) {
  const history = roam.systemHistory ?? [];
  return (
    <div className="space-y-2">
      <div className="min-w-0">
        <span className="text-sm text-gray-200 font-medium">
          {roam.characters.length} players &middot; {roam.shipTypes.length} ship types
        </span>
        <div className="text-xs text-gray-500">
          {history.length} systems &middot; Last activity {timeAgo(roam.lastKillAt)}
        </div>
      </div>
      {history.length > 0 && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Path</span>
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {history.map((entry, i) => (
              <span key={`${entry.systemId}-${i}`} className="flex items-center gap-1">
                <span className="text-xs text-gray-300 bg-white/5 px-1.5 py-0.5 rounded">{entry.systemName}</span>
                {i < history.length - 1 && <span className="text-gray-600 text-xs">&rarr;</span>}
              </span>
            ))}
            {(roam.predictedNext ?? []).length > 0 && (
              <>
                <span className="text-gray-600 text-xs">&rarr;</span>
                <span className="text-xs text-amber-400/70 bg-amber-400/5 px-1.5 py-0.5 rounded italic">{roam.predictedNext[0]}?</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
