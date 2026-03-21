import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import type { PochvenSystem, DetectedFight, WsKillEvent, PilotPresence, WsPilotLocationsEvent } from '@monipoch/shared';
import { POCHVEN_SYSTEMS, EXTRA_TRACKED_SYSTEMS } from '@monipoch/shared';
import { apiJson } from '../lib/api';
import {
  Bell,
  BarChart3,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useWebSocket, useWsStore } from '../hooks/useWebSocket';
import { useAuthStore } from '../stores/auth';
import { useSoundPreferences } from '../stores/sound-preferences';
import { useMapStore, type TimeWindow } from '../stores/map';
import { useOverlayStore, type OverlayPanel } from '../stores/overlay';
import PochvenMap from '../components/map/PochvenMap';
import StarField from '../components/map/StarField';
import KillTicker from '../components/map/KillTicker';
import SystemPopup from '../components/map/SystemPopup';
import TacticalPopup from '../components/map/TacticalPopup';
import MapLegend from '../components/map/MapLegend';
import { computeLayout } from '../components/map/layout';
import type { FleetGroupResponse } from '../components/map/fleetTypes';
import type { GateCampData } from '../components/map/CampIndicator';
import type { RoamingFleetData } from '../components/map/RoamIndicator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import NotificationPanel from '../components/panels/NotificationPanel';
import AnalyticsPanel from '../components/panels/AnalyticsPanel';
import DebugPanel from '../components/panels/DebugPanel';
import { PILOT_ROLE_LABELS, PILOT_ROLE_COLORS } from '../components/map/PilotPresenceIndicator';

const TIME_WINDOWS: { label: string; value: TimeWindow }[] = [
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '24H', value: '24h' },
  { label: '3D', value: '3d' },
  { label: '7D', value: '7d' },
];

const NAV_TOP: { panel: OverlayPanel; icon: typeof BarChart3; label: string; color: string }[] = [
  { panel: 'analytics', icon: BarChart3, label: 'Analytics', color: 'text-purple-400' },
  { panel: 'notifications', icon: Bell, label: 'Notifications', color: 'text-blue-400' },
];

const NAV_BOTTOM: { panel: OverlayPanel; icon: typeof Bell; label: string; color: string }[] = [
  
];

function PanelContent({ panel }: { panel: OverlayPanel }) {
  switch (panel) {
    case 'notifications': return <NotificationPanel />;
    case 'analytics': return <AnalyticsPanel />;
    default: return null;
  }
}

export default function MapPage() {
  useWebSocket();
  const loadSoundPrefs = useSoundPreferences((s) => s.load);
  useEffect(() => { loadSoundPrefs(); }, [loadSoundPrefs]);
  const queryClient = useQueryClient();
  const lastEvent = useWsStore((s) => s.lastEvent);
  const processedKillIds = useRef(new Set<number>());

  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.type === 'fight.started' || lastEvent.type === 'fight.updated' || lastEvent.type === 'fight.ended') {
      queryClient.invalidateQueries({ queryKey: ['fights-active'] });
    }

    if (lastEvent.type === 'pilot.locations') {
      queryClient.setQueryData<PilotPresence[]>(
        ['pilot-locations'],
        (lastEvent as WsPilotLocationsEvent).pilots,
      );
    }

    if (lastEvent.type === 'kill.new') {
      const killId = (lastEvent as WsKillEvent).killmail.killmail_id;
      if (processedKillIds.current.has(killId)) return;
      processedKillIds.current.add(killId);
      if (processedKillIds.current.size > 200) {
        const ids = [...processedKillIds.current];
        for (let i = 0; i < ids.length - 100; i++) processedKillIds.current.delete(ids[i]);
      }

      const systemId = (lastEvent as WsKillEvent).killmail.solar_system_id;
      type HeatmapData = Record<number, { kills1h: number; kills6h: number; kills24h: number; kills3d: number; kills7d: number }>;
      queryClient.setQueryData<HeatmapData>(['heatmap'], (old) => {
        if (!old) return old;
        const prev = old[systemId] ?? { kills1h: 0, kills6h: 0, kills24h: 0, kills3d: 0, kills7d: 0 };
        return {
          ...old,
          [systemId]: {
            kills1h: prev.kills1h + 1,
            kills6h: prev.kills6h + 1,
            kills24h: prev.kills24h + 1,
            kills3d: prev.kills3d + 1,
            kills7d: prev.kills7d + 1,
          },
        };
      });
    }
  }, [lastEvent, queryClient]);

  const character = useAuthStore((s) => s.character);
  const logout = useAuthStore((s) => s.logout);
  const { timeWindow, setTimeWindow, selectedSystemId, selectedTacticalId, soundEnabled, toggleSound } = useMapStore();
  const connected = useWsStore((s) => s.connected);
  const { activePanel, togglePanel } = useOverlayStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [svgRect, setSvgRect] = useState<DOMRect | null>(null);

  const allSystems = useMemo(() => [...POCHVEN_SYSTEMS, ...EXTRA_TRACKED_SYSTEMS], []);
  const positions = useMemo(() => computeLayout(allSystems), [allSystems]);

  const selectedSystem = useMemo(
    () => (selectedSystemId ? allSystems.find((s) => s.systemId === selectedSystemId) ?? null : null),
    [selectedSystemId, allSystems],
  );

  const selectedPos = useMemo(() => {
    if (!selectedSystem) return null;
    return positions.get(selectedSystem.name) ?? null;
  }, [selectedSystem, positions]);

  const updateSvgRect = useCallback(() => {
    if (svgRef.current) setSvgRect(svgRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!selectedSystemId && !selectedTacticalId) return;
    updateSvgRect();
    window.addEventListener('resize', updateSvgRect);
    window.addEventListener('scroll', updateSvgRect, true);
    return () => {
      window.removeEventListener('resize', updateSvgRect);
      window.removeEventListener('scroll', updateSvgRect, true);
    };
  }, [selectedSystemId, selectedTacticalId, updateSvgRect]);

  useEffect(() => {
    if (!selectedSystemId && !selectedTacticalId) return;
    updateSvgRect();
    const id = setTimeout(updateSvgRect, 250);
    return () => clearTimeout(id);
  }, [activePanel, selectedSystemId, selectedTacticalId, updateSvgRect]);

  const { data: topology } = useQuery({
    queryKey: ['topology'],
    queryFn: () =>
      apiJson<{ systems: PochvenSystem[]; connections: [string, string][] }>(
        '/api/map/topology',
      ),
    staleTime: Infinity,
  });

  const { data: heatmap } = useQuery({
    queryKey: ['heatmap'],
    queryFn: () =>
      apiJson<Record<number, { kills1h: number; kills6h: number; kills24h: number; kills3d: number; kills7d: number }>>(
        '/api/map/heatmap',
      ),
    refetchInterval: 60_000,
  });

  const { data: activeFights } = useQuery({
    queryKey: ['fights-active'],
    queryFn: () => apiJson<DetectedFight[]>('/api/map/fights/active'),
    refetchInterval: 15_000,
  });

  const { data: activeGroups } = useQuery({
    queryKey: ['tactical-active'],
    queryFn: () => apiJson<FleetGroupResponse[]>('/api/intel/tactical/active'),
    refetchInterval: 15_000,
  });

  const { data: pilotPresence } = useQuery({
    queryKey: ['pilot-locations'],
    queryFn: () => apiJson<PilotPresence[]>('/api/map/pilots'),
    refetchInterval: 20_000,
  });

  const activeCamps = useMemo<GateCampData[]>(
    () => (activeGroups ?? []).filter((g): g is GateCampData => g.type === 'camp'),
    [activeGroups],
  );
  const activeRoams = useMemo<RoamingFleetData[]>(
    () => (activeGroups ?? []).filter((g): g is RoamingFleetData => g.type === 'roam'),
    [activeGroups],
  );

  const tacticalNodePos = useMemo(() => {
    if (!selectedTacticalId) return null;
    const isCamp = selectedTacticalId.startsWith('camp-');
    const rawId = selectedTacticalId.replace(/^(camp|roam)-/, '');
    if (isCamp) {
      const camp = activeCamps.find((c) => String(c.id) === rawId);
      if (!camp) return null;
      const sys = allSystems.find((s) => s.systemId === camp.currentSystemId);
      if (!sys) return null;
      return positions.get(sys.name) ?? null;
    } else {
      const roam = activeRoams.find((r) => r.id === rawId);
      if (!roam) return null;
      const hist = roam.systemHistory ?? [];
      if (hist.length === 0) return null;
      const sys = allSystems.find((s) => s.systemId === hist[hist.length - 1].systemId);
      if (!sys) return null;
      return positions.get(sys.name) ?? null;
    }
  }, [selectedTacticalId, activeCamps, activeRoams, positions]);

  // Pilot tooltip
  const [hoveredPilot, setHoveredPilot] = useState<{ pilot: PilotPresence; screenX: number; screenY: number } | null>(null);
  const pilotTooltipBorderRef = useRef<HTMLDivElement>(null);
  const pilotTooltipRafRef = useRef(0);

  useEffect(() => {
    if (!hoveredPilot) {
      cancelAnimationFrame(pilotTooltipRafRef.current);
      return;
    }
    const p1 = Math.random() * Math.PI * 2;
    const p2 = Math.random() * Math.PI * 2;
    function tick() {
      const t = Date.now() * 0.0008;
      const deg = Math.sin(t + p1) * 180 + Math.cos(t * 0.6 + p2) * 90;
      if (pilotTooltipBorderRef.current) {
        pilotTooltipBorderRef.current.style.background = `linear-gradient(${deg}deg, rgba(212,212,216,0.55), rgba(239,68,68,0.25))`;
      }
      pilotTooltipRafRef.current = requestAnimationFrame(tick);
    }
    pilotTooltipRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(pilotTooltipRafRef.current);
  }, [hoveredPilot]);

  const handlePilotHover = useCallback((pilot: PilotPresence, svgX: number, svgY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const viewBoxW = 1000;
    const viewBoxH = 750;
    const svgAspect = viewBoxW / viewBoxH;
    const rectAspect = rect.width / rect.height;
    let renderW: number, renderH: number, renderX: number, renderY: number;
    if (rectAspect > svgAspect) {
      renderH = rect.height;
      renderW = renderH * svgAspect;
      renderX = rect.left + (rect.width - renderW) / 2;
      renderY = rect.top;
    } else {
      renderW = rect.width;
      renderH = renderW / svgAspect;
      renderX = rect.left;
      renderY = rect.top + (rect.height - renderH) / 2;
    }
    setHoveredPilot({
      pilot,
      screenX: renderX + (svgX / viewBoxW) * renderW,
      screenY: renderY + (svgY / viewBoxH) * renderH,
    });
  }, []);

  const handlePilotLeave = useCallback(() => setHoveredPilot(null), []);

  function getKillCount(systemId: number): number {
    const data = heatmap?.[systemId];
    if (!data) return 0;
    switch (timeWindow) {
      case '1h': return data.kills1h;
      case '6h': return data.kills6h;
      case '24h': return data.kills24h;
      case '3d': return data.kills3d;
      case '7d': return data.kills7d;
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <StarField />
      <div className="h-screen bg-transparent flex flex-col overflow-hidden relative z-[1]">
        {/* Header */}
        <header className="h-14 border-b border-pochven-border flex items-center justify-between px-5 flex-shrink-0 bg-pochven-bg/80 backdrop-blur-sm">
          <div className="flex items-center gap-5">
            <h1 className="text-base font-bold tracking-wide">
              <span className="text-pochven-accent">MONI</span>
              <span className="gradient-drift-text">POCH</span>
            </h1>

            <div className="flex gap-1.5">
              {TIME_WINDOWS.map((tw) => {
                const isActive = timeWindow === tw.value;
                const numPart = tw.label.replace(/[A-Z]/g, '');
                const letterPart = tw.label.replace(/[0-9]/g, '');

                if (isActive) {
                  return (
                    <div key={tw.value} className="gradient-border-btn">
                      <button
                        onClick={() => setTimeWindow(tw.value)}
                        className="px-2.5 py-1 text-sm rounded bg-pochven-bg/90 block"
                      >
                        <span className="text-pochven-accent">{numPart}</span>
                        <span className="text-gray-400">{letterPart}</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={tw.value}
                    onClick={() => setTimeWindow(tw.value)}
                    className="px-2.5 py-1 text-sm rounded transition-all duration-150 text-gray-500 hover:text-gray-300 border border-transparent"
                  >
                    {tw.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${
                  connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-gray-500">
                {connected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <span className="text-sm text-gray-400">{character?.characterName}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Body: sidebar + optional panel + map */}
        <div className="flex-1 flex min-h-0">
          {/* Permanent left sidebar */}
          <nav className="w-14 flex-shrink-0 bg-pochven-surface/80 backdrop-blur-sm border-r border-pochven-border flex flex-col items-center py-3 gap-1">
            {NAV_TOP.map(({ panel, icon: Icon, label, color }) => {
              const isActive = activePanel === panel;
              return (
                <Tooltip key={panel}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => togglePanel(panel)}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
                        isActive
                          ? `${color} bg-white/10`
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? '' : 'gradient-drift-icon'}`} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">{label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}

            <div className="flex-1" />

            {NAV_BOTTOM.map(({ panel, icon: Icon, label, color }) => {
              const isActive = activePanel === panel;
              return (
                <Tooltip key={panel}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => togglePanel(panel)}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
                        isActive
                          ? `${color} bg-white/10`
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? '' : 'gradient-drift-icon'}`} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">{label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSound}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all duration-150"
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">{soundEnabled ? 'Mute' : 'Unmute'}</p>
              </TooltipContent>
            </Tooltip>
          </nav>

          {/* Animated inline feature panel */}
          <AnimatePresence mode="wait">
            {activePanel && (
              <motion.div
                key={activePanel}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 420, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="flex-shrink-0 bg-pochven-surface/95 backdrop-blur-xl border-r border-pochven-border flex flex-col overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-[420px]">
                  <PanelContent panel={activePanel} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Map area */}
          <main className="flex-1 relative overflow-hidden min-w-0">
            <MapLegend />
            {topology && (
              <PochvenMap
                ref={svgRef}
                systems={topology.systems}
                connections={topology.connections}
                heatmap={heatmap ?? {}}
                activeFights={activeFights ?? []}
                activeCamps={activeCamps}
                activeRoams={activeRoams}
                pilotPresence={pilotPresence ?? []}
                timeWindow={timeWindow}
                onPilotHover={handlePilotHover}
                onPilotLeave={handlePilotLeave}
              />
            )}
            <KillTicker />

            <AnimatePresence>
              {selectedSystem && selectedPos && (
                <SystemPopup
                  key={selectedSystem.systemId}
                  system={selectedSystem}
                  x={selectedPos.x}
                  y={selectedPos.y}
                  kills={getKillCount(selectedSystem.systemId)}
                  svgRect={svgRect}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedTacticalId && tacticalNodePos && (
                <TacticalPopup
                  key={selectedTacticalId}
                  tacticalId={selectedTacticalId}
                  camps={activeCamps}
                  roams={activeRoams}
                  nodeX={tacticalNodePos.x}
                  nodeY={tacticalNodePos.y}
                  svgRect={svgRect}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {hoveredPilot && (() => {
                const { pilot, screenX, screenY } = hoveredPilot;
                const shipUrl = pilot.shipTypeId
                  ? `https://images.evetech.net/types/${pilot.shipTypeId}/render?size=64`
                  : null;
                const role = pilot.fleetRole ? PILOT_ROLE_LABELS[pilot.fleetRole] : null;
                const roleClr = pilot.fleetRole ? (PILOT_ROLE_COLORS[pilot.fleetRole] ?? '#4ade80') : null;
                const W = 210;
                let left = screenX - W / 2;
                if (left < 8) left = 8;
                if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;

                return (
                  <motion.div
                    key={`pilot-tt-${pilot.characterId}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed z-[200] pointer-events-none"
                    style={{ left, top: screenY - 14, width: W, transform: 'translateY(-100%)' }}
                  >
                    <div className="relative rounded-lg" style={{ padding: '1.5px' }}>
                      <div ref={pilotTooltipBorderRef} className="absolute inset-0 rounded-lg" />
                      <div className="relative rounded-lg overflow-hidden bg-pochven-surface/95 backdrop-blur-xl shadow-2xl flex items-center gap-2 px-2.5 py-2">
                        {shipUrl && (
                          <img src={shipUrl} alt="" className="w-8 h-8 rounded bg-black/30 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-200 truncate leading-tight">
                              {pilot.characterName}
                            </span>
                            {role && (
                              <span className="text-[11px] font-bold flex-shrink-0" style={{ color: roleClr! }}>
                                [{role}]
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate leading-tight mt-0.5">
                            {pilot.shipTypeName || 'Unknown Ship'}
                          </div>
                        </div>
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 -bottom-[4px]">
                        <div
                          className="w-0 h-0"
                          style={{
                            borderLeft: '4px solid transparent',
                            borderRight: '4px solid transparent',
                            borderTop: '4px solid rgba(22, 16, 16, 0.95)',
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </main>
          <div className="fixed bottom-2 right-3 z-20 text-[11px] text-gray-500/60 select-none pointer-events-auto">
            made by Gusb · ISK tips always appreciated
          </div>
          {import.meta.env.DEV && <DebugPanel />}
        </div>
      </div>
    </TooltipProvider>
  );
}
