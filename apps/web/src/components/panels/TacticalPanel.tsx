import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiJson } from '@/lib/api';
import type { FleetGroupResponse } from '../map/fleetTypes';

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function TacticalPanel() {
  const { data: groups = [], isLoading } = useQuery<FleetGroupResponse[]>({
    queryKey: ['tactical-active'],
    queryFn: () => apiJson<FleetGroupResponse[]>('/api/intel/tactical/active'),
    refetchInterval: 15_000,
  });

  const camps = useMemo(() => groups.filter((g) => g.type === 'camp'), [groups]);
  const roams = useMemo(() => groups.filter((g) => g.type === 'roam'), [groups]);

  return (
    <Tabs defaultValue="camps" className="h-full flex flex-col">
      <div className="px-4 pt-2 flex-shrink-0">
        <TabsList className="w-full bg-pochven-surface/80 border border-pochven-border">
          <TabsTrigger
            value="camps"
            className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
          >
            Gate Camps
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
              {camps.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="roams"
            className="flex-1 data-[state=active]:bg-pochven-accent/20 data-[state=active]:text-pochven-accent"
          >
            Roaming Fleets
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
              {roams.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <TabsContent value="camps" className="m-0 p-4 pt-2 focus-visible:ring-0 focus-visible:ring-offset-0">
          {isLoading ? (
            <div className="text-sm text-gray-500">Loading gate camps...</div>
          ) : camps.length === 0 ? (
            <div className="text-sm text-gray-500">No active gate camps detected</div>
          ) : (
            <div className="space-y-3">
              {camps.map((camp) => (
                <div
                  key={camp.id}
                  className={cn(
                    'rounded-lg border border-pochven-border bg-pochven-bg/50 p-3',
                    'border-l-4 border-l-red-500',
                  )}
                >
                  <div className="text-base font-semibold text-gray-100">{camp.systemName}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {camp.characters.length} players
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] border-pochven-border text-gray-400">
                      {camp.shipTypes.length} ship type{camp.shipTypes.length !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="destructive" className="text-[10px]">
                      {camp.killCount} kill{camp.killCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-2 space-x-3">
                    <span>Detected {timeAgo(camp.firstSeenAt)}</span>
                    <span>Last kill {timeAgo(camp.lastKillAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roams" className="m-0 p-4 pt-2 focus-visible:ring-0 focus-visible:ring-offset-0">
          {isLoading ? (
            <div className="text-sm text-gray-500">Loading roaming fleets...</div>
          ) : roams.length === 0 ? (
            <div className="text-sm text-gray-500">No roaming fleets tracked</div>
          ) : (
            <div className="space-y-3">
              {roams.map((roam) => (
                <div
                  key={roam.id}
                  className={cn(
                    'rounded-lg border border-pochven-border bg-pochven-bg/50 p-3',
                    'border-l-4 border-l-orange-500',
                  )}
                >
                  <div className="text-base font-semibold text-gray-100">
                    {roam.characters.length} players &middot; {roam.systemName}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Path:{' '}
                    {(roam.systemHistory ?? []).length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {(roam.systemHistory ?? []).map((s, i) => (
                          <span key={s.systemId}>
                            {i > 0 && <span className="text-gray-600 mx-0.5">&rarr;</span>}
                            <span className="text-gray-300">{s.systemName}</span>
                          </span>
                        ))}
                        {(roam.predictedNext ?? []).length > 0 && (
                          <>
                            <span className="text-gray-600 mx-0.5">&rarr;</span>
                            {(roam.predictedNext ?? []).map((name) => (
                              <span
                                key={name}
                                className="bg-amber-500/20 text-amber-400 px-1 rounded border border-amber-500/30"
                              >
                                {name}
                              </span>
                            ))}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-500">&mdash;</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-2">
                    Last activity {timeAgo(roam.lastKillAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
