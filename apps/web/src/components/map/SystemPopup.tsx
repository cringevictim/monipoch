import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { X, Clock, TrendingUp } from 'lucide-react';
import type { PochvenSystem } from '@monipoch/shared';
import { Constellation } from '@monipoch/shared';
import { apiJson } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useMapStore } from '../../stores/map';

interface EnrichedKillmailRow {
  killmail_id: number;
  solar_system_id: number;
  killmail_time: string;
  victim_character_id: number | null;
  victim_corporation_id: number | null;
  victim_alliance_id: number | null;
  victim_ship_type_id: number;
  victim_ship_name: string | null;
  total_value: number;
  attacker_count: number;
  is_npc: boolean;
  is_solo: boolean;
  victim_name: string | null;
  victim_corp_name: string | null;
  victim_corp_ticker: string | null;
  victim_alliance_name: string | null;
  victim_alliance_ticker: string | null;
  fb_character_id: number | null;
  fb_corporation_id: number | null;
  fb_alliance_id: number | null;
  fb_ship_type_id: number | null;
  fb_character_name: string | null;
  fb_corp_name: string | null;
  fb_corp_ticker: string | null;
  fb_alliance_name: string | null;
  fb_alliance_ticker: string | null;
  fb_ship_name: string | null;
  victim_is_alliance?: boolean | number;
  attacker_is_alliance?: boolean | number;
}

interface Props {
  system: PochvenSystem;
  x: number;
  y: number;
  kills: number;
  svgRect: DOMRect | null;
}

const CONSTELLATION_COLORS: Record<Constellation, string> = {
  [Constellation.KRAI_PERUN]: '#3498db',
  [Constellation.KRAI_SVAROG]: '#e74c3c',
  [Constellation.KRAI_VELES]: '#2ecc71',
};

const CONSTELLATION_LABELS: Record<Constellation, string> = {
  [Constellation.KRAI_PERUN]: 'Krai Perun',
  [Constellation.KRAI_SVAROG]: 'Krai Svarog',
  [Constellation.KRAI_VELES]: 'Krai Veles',
};

function evePortrait(characterId: number, size = 32) {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

function eveCorpLogo(corpId: number, size = 32) {
  return `https://images.evetech.net/corporations/${corpId}/logo?size=${size}`;
}

function eveAllianceLogo(allianceId: number, size = 32) {
  return `https://images.evetech.net/alliances/${allianceId}/logo?size=${size}`;
}

function eveShipRender(typeId: number, size = 32) {
  return `https://images.evetech.net/types/${typeId}/render?size=${size}`;
}

function Shimmer({ w = 'w-20', h = 'h-3' }: { w?: string; h?: string }) {
  return <span className={`${w} ${h} rounded bg-white/10 animate-pulse inline-block`} />;
}

function formatIsk(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getNodeRadius(kills: number, systemType: string): number {
  const base = systemType === 'home' ? 14 : systemType === 'border' ? 13 : 11;
  if (kills === 0) return base;
  if (kills <= 5) return base + 2;
  if (kills <= 15) return base + 4;
  return base + 6;
}

export default function SystemPopup({ system, x, y, kills, svgRect }: Props) {
  const closeSystem = useMapStore((s) => s.selectSystem);
  const popupRef = useRef<HTMLDivElement>(null);

  const { data: recentKills, isLoading } = useQuery({
    queryKey: ['system-kills', system.systemId],
    queryFn: () => apiJson<EnrichedKillmailRow[]>(`/api/map/system/${system.systemId}/kills?hours=24`),
    refetchInterval: 30_000,
  });

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSystem(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeSystem]);

  const driftRef = useRef(0);
  const [drift, setDrift] = useState({ dx: 0, dy: 0, gradAngle: 0 });
  useEffect(() => {
    const phase = Math.random() * Math.PI * 2;
    const gradPhase1 = Math.random() * Math.PI * 2;
    const gradPhase2 = Math.random() * Math.PI * 2;
    function tick() {
      const t = Date.now() * 0.0003;
      const gradAngle = Math.sin(t * 0.8 + gradPhase1) * Math.PI + Math.cos(t * 0.5 + gradPhase2) * Math.PI * 0.5;
      setDrift({
        dx: Math.sin(t + phase) * 5,
        dy: Math.cos(t * 0.7 + phase) * 3,
        gradAngle,
      });
      driftRef.current = requestAnimationFrame(tick);
    }
    driftRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(driftRef.current);
  }, []);

  if (!svgRect) return null;

  const popupW = 620;
  const popupH = 520;
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
  const sysScreenX = renderX + (x / viewBoxW) * renderW;
  const sysScreenY = renderY + (y / viewBoxH) * renderH;
  const scale = renderW / viewBoxW;
  const svgNodeR = getNodeRadius(kills, system.systemType);
  const selectionStroke = 2;
  const nodeScreenR = Math.max((svgNodeR + selectionStroke) * scale, 14);
  const hGap = nodeScreenR + 40;

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

  const popupLeft = left;
  const popupRight = left + popupW;
  const nodeLeft = sysScreenX - nodeScreenR;
  const nodeRight = sysScreenX + nodeScreenR;
  const nodeTop = sysScreenY - nodeScreenR;
  const nodeBottom = sysScreenY + nodeScreenR;
  const horizontalOverlap = popupLeft < nodeRight + 8 && popupRight > nodeLeft - 8;

  let top: number;
  if (horizontalOverlap) {
    top = nodeBottom + 20;
  } else {
    top = sysScreenY - 60;
  }
  if (top < 50) top = 50;
  if (top + popupH > window.innerHeight - 16) top = window.innerHeight - popupH - 16;
  if (horizontalOverlap && top < nodeBottom + 12) {
    top = nodeTop - popupH - 20;
    if (top < 50) top = 50;
  }

  const popupEdgeX = onRight ? left : left + popupW;
  const popupEdgeY = Math.min(Math.max(sysScreenY, top + 20), top + popupH - 20);

  const accentColor = system.constellation
    ? CONSTELLATION_COLORS[system.constellation]
    : '#8899aa';
  const totalIsk = recentKills?.reduce((sum, k) => sum + Number(k.total_value), 0) ?? 0;

  const lineId = `connector-${system.systemId}`;

  const driftedEdgeX = popupEdgeX + drift.dx;
  const driftedEdgeY = popupEdgeY + drift.dy;

  // Line starts from node outer edge, not center
  const angle = Math.atan2(driftedEdgeY - sysScreenY, driftedEdgeX - sysScreenX);
  const lineStartX = sysScreenX + Math.cos(angle) * nodeScreenR;
  const lineStartY = sysScreenY + Math.sin(angle) * nodeScreenR;

  return (
    <>
      {/* Connector line from system edge to popup */}
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
            <stop offset="0%" stopColor="#d4d4d8" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <line
          x1={lineStartX}
          y1={lineStartY}
          x2={driftedEdgeX}
          y2={driftedEdgeY}
          stroke={`url(#${lineId})`}
          strokeWidth={1.5}
        />
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
        {/* Gradient outline — drifting direction */}
        <svg
          className="absolute pointer-events-none z-10"
          style={{
            top: -1, left: -1,
            width: popupW + 2, height: '100%',
            overflow: 'visible',
            background: 'none',
          }}
        >
          <defs>
            <linearGradient
              id={`${lineId}-outline`}
              x1={`${50 + Math.cos(drift.gradAngle) * 50}%`}
              y1={`${50 + Math.sin(drift.gradAngle) * 50}%`}
              x2={`${50 - Math.cos(drift.gradAngle) * 50}%`}
              y2={`${50 - Math.sin(drift.gradAngle) * 50}%`}
            >
              <stop offset="0%" stopColor="#d4d4d8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <rect x="0.5" y="0.5" rx="8" ry="8"
            width={popupW + 1} height="100%"
            stroke={`url(#${lineId}-outline)`} strokeWidth="1.5" fill="none" />
        </svg>
        <div className="rounded-lg overflow-hidden bg-pochven-surface/95 backdrop-blur-xl shadow-2xl relative z-20">
      {/* Header */}
      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${accentColor}30` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accentColor }} />
          <span className="text-sm font-bold text-gray-100 truncate">{system.name}</span>
          <span className="text-[12px] text-gray-500 flex-shrink-0">
            {system.constellation ? CONSTELLATION_LABELS[system.constellation] : 'External'} &middot; {system.securityClass}
          </span>
          {system.systemType === 'home' && (
            <span className="text-[9px] px-1 py-px rounded bg-white/10 text-gray-400 uppercase tracking-wider font-medium flex-shrink-0">
              Home
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-gray-200">{formatIsk(totalIsk)}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); closeSystem(null); }}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Recent kills */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Recent Kills (24h)
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2 py-3 px-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2.5 animate-pulse">
                <div className="w-12 h-12 rounded bg-white/10 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-white/10" />
                  <div className="h-3 w-32 rounded bg-white/8" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="h-3.5 w-14 rounded bg-white/10" />
                  <div className="h-3 w-10 rounded bg-white/8" />
                </div>
                <div className="flex-1 space-y-1.5 flex flex-col items-end">
                  <div className="h-3.5 w-24 rounded bg-white/10" />
                  <div className="h-3 w-32 rounded bg-white/8" />
                </div>
                <div className="w-12 h-12 rounded bg-white/10 flex-shrink-0" />
              </div>
            ))}
            <p className="text-xs text-gray-600 text-center pt-1">Loading kills...</p>
          </div>
        ) : !recentKills?.length ? (
          <div className="text-xs text-gray-600 py-8 text-center">No kills in the last 24 hours</div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-0.5 pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {recentKills.slice(0, 30).map((km) => {
              const isAllianceLoss = !!km.victim_is_alliance;
              const isAllianceKill = !isAllianceLoss && !!km.attacker_is_alliance;
              return (
                <a
                  key={km.killmail_id}
                  href={`https://zkillboard.com/kill/${km.killmail_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 py-2 px-2 rounded transition-all duration-150 cursor-pointer hover:bg-white/5"
                >
                  {/* Victim side */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="flex flex-col items-center flex-shrink-0 w-14">
                      <img
                        src={eveShipRender(km.victim_ship_type_id, 64)}
                        alt={km.victim_ship_name ?? ''}
                        title={km.victim_ship_name ?? undefined}
                        className="w-12 h-12 rounded bg-black/30"
                        loading="lazy"
                      />
                      {km.victim_ship_name ? (
                        <span className="text-[12px] text-gray-600 truncate w-full text-center mt-0.5 leading-tight">
                          {km.victim_ship_name}
                        </span>
                      ) : (
                        <Shimmer w="w-12" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {km.victim_character_id ? (
                          <>
                            <img
                              src={evePortrait(km.victim_character_id, 64)}
                              alt=""
                              className="w-6 h-6 rounded-full flex-shrink-0"
                              loading="lazy"
                            />
                            <span className="text-sm text-gray-200 truncate font-medium">
                              {km.victim_name ? km.victim_name : <Shimmer w="w-24" h="h-4" />}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-500">Structure / NPC</span>
                        )}
                      </div>
                      {km.victim_corporation_id && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <img
                            src={eveCorpLogo(km.victim_corporation_id, 32)}
                            alt=""
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            loading="lazy"
                          />
                          {km.victim_corp_name ? (
                            <span className="text-xs text-gray-500 truncate">{km.victim_corp_name}</span>
                          ) : (
                            <Shimmer w="w-28" />
                          )}
                        </div>
                      )}
                      {km.victim_alliance_id && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <img
                            src={eveAllianceLogo(km.victim_alliance_id, 32)}
                            alt=""
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            loading="lazy"
                          />
                          {km.victim_alliance_name ? (
                            <span className="text-xs text-gray-500 truncate">{km.victim_alliance_name}</span>
                          ) : (
                            <Shimmer w="w-32" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Center: ISK + time + solo/fleet */}
                  <div className="flex flex-col items-center flex-shrink-0 gap-0.5 px-2">
                    <span
                      className={cn(
                        'text-sm font-bold',
                        isAllianceKill ? 'text-green-400' : isAllianceLoss ? 'text-red-400' : 'text-gray-300',
                      )}
                    >
                      {formatIsk(Number(km.total_value))}
                    </span>
                    <div className="flex items-center gap-0.5 text-[11px] text-gray-600">
                      <Clock className="h-3 w-3" />
                      {timeAgo(km.killmail_time)}
                    </div>
                    <div className={cn(
                      'flex items-center gap-0.5 text-[11px] font-medium',
                      km.is_solo ? 'text-yellow-400' : 'text-blue-400',
                    )}>
                      {km.is_solo ? 'Solo' : `Fleet (${km.attacker_count})`}
                    </div>
                  </div>

                  {/* Attacker (final blow) side */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
                    <div className="min-w-0 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        {km.fb_character_id ? (
                          <>
                            <span className="text-sm text-gray-200 truncate font-medium">
                              {km.fb_character_name ? km.fb_character_name : <Shimmer w="w-24" h="h-4" />}
                            </span>
                            <img
                              src={evePortrait(km.fb_character_id, 64)}
                              alt=""
                              className="w-6 h-6 rounded-full flex-shrink-0"
                              loading="lazy"
                            />
                          </>
                        ) : (
                          <span className="text-sm text-gray-500">
                            {km.attacker_count > 0 ? 'NPC' : '?'}
                          </span>
                        )}
                      </div>
                      {km.fb_corporation_id && (
                        <div className="flex items-center gap-1 mt-0.5 justify-end">
                          {km.fb_corp_name ? (
                            <span className="text-xs text-gray-500 truncate">{km.fb_corp_name}</span>
                          ) : (
                            <Shimmer w="w-28" />
                          )}
                          <img
                            src={eveCorpLogo(Number(km.fb_corporation_id), 32)}
                            alt=""
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            loading="lazy"
                          />
                        </div>
                      )}
                      {km.fb_alliance_id && (
                        <div className="flex items-center gap-1 mt-0.5 justify-end">
                          {km.fb_alliance_name ? (
                            <span className="text-xs text-gray-500 truncate">{km.fb_alliance_name}</span>
                          ) : (
                            <Shimmer w="w-32" />
                          )}
                          <img
                            src={eveAllianceLogo(Number(km.fb_alliance_id), 32)}
                            alt=""
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                    {km.fb_ship_type_id && (
                      <div className="flex flex-col items-center flex-shrink-0 w-14">
                        <img
                          src={eveShipRender(Number(km.fb_ship_type_id), 64)}
                          alt={km.fb_ship_name ?? ''}
                          title={km.fb_ship_name ?? undefined}
                          className="w-12 h-12 rounded bg-black/30"
                          loading="lazy"
                        />
                        {km.fb_ship_name ? (
                          <span className="text-[11px] text-gray-600 truncate w-full text-center mt-0.5 leading-tight">
                            {km.fb_ship_name}
                          </span>
                        ) : (
                          <Shimmer w="w-12" />
                        )}
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-pochven-border flex items-center justify-between">
        <a
          href={`https://zkillboard.com/system/${system.systemId}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5 font-medium"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          zKillboard
        </a>
        <a
          href={`https://evemaps.dotlan.net/system/${system.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-medium"
        >
          DOTLAN
        </a>
      </div>
        </div>
    </motion.div>
    </>
  );
}
