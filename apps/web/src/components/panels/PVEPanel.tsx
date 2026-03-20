import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface SafeSystem {
  systemId: number;
  systemName: string;
  safetyScore: number;
  pvpKills: number;
  npcKills: number;
  activeCamp: boolean;
}

interface NpcKill {
  solar_system_id: number;
  npc_kills: number;
  ship_kills: number;
  pod_kills: number;
  snapshot_time: string;
}

interface Flashpoint {
  systemId: number;
  systemName: string;
  npcKills: number;
  averageNpcKills: number;
  ratio: number;
}

function SafetyScoreBar({ score }: { score: number }) {
  const width = Math.min(100, Math.max(0, score));
  const colorClass =
    score > 70
      ? 'bg-green-500'
      : score >= 40
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-1.5 flex-1 rounded-full bg-pochven-border overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-400 w-8">{score}</span>
    </div>
  );
}

export default function PVEPanel() {
  const { data: safeSystems = [], isLoading: safeLoading } = useQuery<SafeSystem[]>({
    queryKey: ['pve', 'safe-systems'],
    queryFn: () => apiJson<SafeSystem[]>('/api/pve/safe-systems'),
    refetchInterval: 60_000,
  });

  const { data: npcKills = [], isLoading: npcLoading } = useQuery<NpcKill[]>({
    queryKey: ['pve', 'npc-kills'],
    queryFn: () => apiJson<NpcKill[]>('/api/pve/npc-kills'),
    refetchInterval: 60_000,
  });

  const { data: flashpoints = [], isLoading: flashpointsLoading } = useQuery<Flashpoint[]>({
    queryKey: ['pve', 'flashpoints'],
    queryFn: () => apiJson<Flashpoint[]>('/api/pve/flashpoints'),
    refetchInterval: 60_000,
  });

  const sortedSafeSystems = useMemo(
    () => [...safeSystems].sort((a, b) => b.safetyScore - a.safetyScore),
    [safeSystems],
  );

  const sortedNpcKills = useMemo(
    () => [...npcKills].sort((a, b) => b.npc_kills - a.npc_kills),
    [npcKills],
  );

  return (
    <div className="flex h-full flex-col bg-pochven-surface">
      <Tabs defaultValue="safe" className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-pochven-border px-4 py-3">
          <TabsList className="w-full justify-start bg-pochven-bg/50">
            <TabsTrigger
              value="safe"
              className="data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              Safe Systems
            </TabsTrigger>
            <TabsTrigger
              value="npc"
              className="data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              NPC Activity
            </TabsTrigger>
            <TabsTrigger
              value="flashpoints"
              className="data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
            >
              Flashpoints
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="safe"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="px-4 pb-4">
              {safeLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Loading safe systems...
                </div>
              ) : sortedSafeSystems.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No safe systems data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-pochven-border hover:bg-transparent">
                      <TableHead className="text-gray-400">System</TableHead>
                      <TableHead className="text-gray-400">Safety Score</TableHead>
                      <TableHead className="text-gray-400">PVP Kills (6h)</TableHead>
                      <TableHead className="text-gray-400">NPC Kills</TableHead>
                      <TableHead className="text-gray-400">Camp Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSafeSystems.map((sys) => (
                      <TableRow
                        key={sys.systemId}
                        className="border-pochven-border text-gray-300 hover:bg-pochven-bg/50"
                      >
                        <TableCell className="font-medium text-gray-200">
                          {sys.systemName}
                        </TableCell>
                        <TableCell>
                          <SafetyScoreBar score={sys.safetyScore} />
                        </TableCell>
                        <TableCell>{sys.pvpKills.toLocaleString()}</TableCell>
                        <TableCell>{sys.npcKills.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              sys.activeCamp
                                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                                : 'bg-green-500/20 text-green-400 border-green-500/40',
                            )}
                          >
                            {sys.activeCamp ? 'Active' : 'Clear'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="npc"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="px-4 pb-4">
              {npcLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Loading NPC activity...
                </div>
              ) : sortedNpcKills.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No NPC activity data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-pochven-border hover:bg-transparent">
                      <TableHead className="text-gray-400">System</TableHead>
                      <TableHead className="text-gray-400">NPC Kills</TableHead>
                      <TableHead className="text-gray-400">Ship Kills</TableHead>
                      <TableHead className="text-gray-400">Pod Kills</TableHead>
                      <TableHead className="text-gray-400">Last Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedNpcKills.map((row) => (
                      <TableRow
                        key={row.solar_system_id}
                        className="border-pochven-border text-gray-300 hover:bg-pochven-bg/50"
                      >
                        <TableCell className="font-medium text-gray-200">
                          {row.solar_system_id}
                        </TableCell>
                        <TableCell>{row.npc_kills.toLocaleString()}</TableCell>
                        <TableCell>{row.ship_kills.toLocaleString()}</TableCell>
                        <TableCell>{row.pod_kills.toLocaleString()}</TableCell>
                        <TableCell className="text-gray-400 text-xs">
                          {timeAgo(row.snapshot_time)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="flashpoints"
          className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="px-4 pb-4">
              {flashpointsLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Loading flashpoints...
                </div>
              ) : flashpoints.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No Observatory Flashpoints detected
                </div>
              ) : (
                <div className="space-y-3">
                  {flashpoints.map((fp) => (
                    <div
                      key={fp.systemId}
                      className={cn(
                        'rounded-lg border border-pochven-border bg-pochven-bg/50 p-3',
                        'border-l-4 border-l-orange-500 relative',
                      )}
                    >
                      <div className="absolute left-2 top-1/2 -translate-y-1/2">
                        <span
                          className="absolute inline-flex h-2 w-2 rounded-full bg-orange-500 animate-ping opacity-75"
                          aria-hidden
                        />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                      </div>
                      <div className="pl-4">
                        <div className="text-base font-semibold text-gray-100">
                          {fp.systemName}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          <Badge
                            variant="outline"
                            className="border-orange-500/40 text-orange-400 bg-orange-500/10"
                          >
                            {fp.npcKills.toLocaleString()} NPC kills
                          </Badge>
                          <span className="text-gray-500">
                            {fp.ratio.toFixed(1)}&times; avg ({fp.averageNpcKills.toLocaleString()})
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
