import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { apiJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { HostileProfile } from './HostileDetailDialog';

function formatIsk(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(value);
}

function getThreatBadgeClass(score: number): string {
  if (score < 20) return 'bg-green-500/20 text-green-400 border-green-500/40';
  if (score < 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  if (score < 80) return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
  return 'bg-red-500/20 text-red-400 border-red-500/40';
}

const CHARACTER_PORTRAIT_URL =
  'https://images.evetech.net/characters/{characterId}/portrait?size=128';

interface CharacterIntelDialogProps {
  characterId: number | null;
  characterName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CharacterIntelDialog({
  characterId,
  characterName,
  open,
  onOpenChange,
}: CharacterIntelDialogProps) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['intel', 'hostile', characterId],
    queryFn: () =>
      apiJson<HostileProfile | null>(
        `/api/intel/hostiles/${characterId}?entityType=character`,
      ),
    enabled: open && characterId != null,
  });

  const portraitUrl =
    characterId != null
      ? CHARACTER_PORTRAIT_URL.replace('{characterId}', String(characterId))
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-lg bg-pochven-surface border-pochven-border text-gray-300',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-200 sr-only">
            Character Intel: {characterName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6">
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            {portraitUrl && (
              <img
                src={portraitUrl}
                alt={characterName}
                className="h-32 w-32 rounded border border-pochven-border object-cover"
              />
            )}
            <span className="text-lg font-semibold text-gray-200 text-center">
              {characterName}
            </span>
            <Badge
              variant="outline"
              className="bg-blue-500/20 text-blue-400 border-blue-500/40"
            >
              Character
            </Badge>
          </div>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="py-4 text-sm text-gray-500">Loading intel...</div>
            ) : !profile ? (
              <p className="text-sm text-gray-500 py-4">
                No intel available for this character
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">Kills in Pochven</div>
                    <div className="text-lg font-medium text-gray-200">
                      {profile.total_kills.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">Losses in Pochven</div>
                    <div className="text-lg font-medium text-gray-200">
                      {profile.total_losses.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">ISK Destroyed</div>
                    <div className="text-lg font-medium text-gray-200">
                      {formatIsk(profile.total_isk_destroyed)}
                    </div>
                  </div>
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">ISK Lost</div>
                    <div className="text-lg font-medium text-gray-200">
                      {formatIsk(profile.total_isk_lost)}
                    </div>
                  </div>
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">Threat Score</div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-mono text-xs mt-1',
                        getThreatBadgeClass(profile.threat_score),
                      )}
                    >
                      {profile.threat_score.toFixed(1)}
                    </Badge>
                  </div>
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">Avg Fleet Size</div>
                    <div className="text-lg font-medium text-gray-200">
                      {profile.avg_fleet_size.toFixed(1)}
                    </div>
                  </div>
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">First Seen</div>
                    <div className="text-sm font-medium text-gray-200">
                      {new Date(profile.first_seen).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
                    <div className="text-gray-400">Last Seen</div>
                    <div className="text-sm font-medium text-gray-200">
                      {timeAgo(profile.last_seen)}
                    </div>
                  </div>
                </div>

                {/* Activity Timezone */}
                <div>
                  <h4 className="mb-2 text-sm font-medium text-gray-400">
                    Activity Timezone
                  </h4>
                  <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const activityByHour = profile.activity_by_hour ?? {};
                      const maxActivity = Math.max(
                        ...Object.values(activityByHour).map(Number),
                        1,
                      );
                      const count = Number(activityByHour[String(hour)] ?? 0);
                      const intensity =
                        maxActivity > 0 ? count / maxActivity : 0;
                      const opacity = 0.2 + intensity * 0.8;
                      const showLabel = [0, 6, 12, 18].includes(hour);
                      return (
                        <div
                          key={hour}
                          className="flex flex-col items-center gap-0.5"
                          title={`${hour}:00 - ${count} activities`}
                        >
                          <div
                            className="h-6 w-full min-w-[8px] rounded-sm bg-pochven-accent transition-opacity"
                            style={{ opacity }}
                          />
                          {showLabel && (
                            <span className="text-[10px] text-gray-500">
                              {hour}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top Ships */}
                <div>
                  <h4 className="mb-2 text-sm font-medium text-gray-400">
                    Top Ships
                  </h4>
                  {(() => {
                    const shipEntries = Object.entries(
                      profile.preferred_ship_types ?? {},
                    )
                      .map(([id, count]) => ({ id, count }))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5);
                    return shipEntries.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No ship data available
                      </p>
                    ) : (
                      <ul className="space-y-1.5 rounded border border-pochven-border bg-pochven-bg/50 p-3">
                        {shipEntries.map(({ id, count }) => (
                          <li
                            key={id}
                            className="flex items-center justify-between text-sm text-gray-300"
                          >
                            <span>Ship Type {id}</span>
                            <span className="font-medium text-gray-200">
                              {count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
