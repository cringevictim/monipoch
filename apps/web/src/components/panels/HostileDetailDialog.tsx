import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface HostileProfile {
  id: number;
  entity_type: 'character' | 'corporation' | 'alliance';
  entity_id: number;
  entity_name: string;
  total_kills: number;
  total_losses: number;
  total_isk_destroyed: number;
  total_isk_lost: number;
  threat_score: number;
  preferred_ship_types: Record<string, number>;
  activity_by_hour: Record<string, number>;
  preferred_systems: Record<string, number>;
  avg_fleet_size: number;
  first_seen: string;
  last_seen: string;
  last_seen_system: number;
  last_updated: string;
}

interface HostileDetailDialogProps {
  profile: HostileProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getEntityTypeLabel(type: HostileProfile['entity_type']): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function HostileDetailDialog({
  profile,
  open,
  onOpenChange,
}: HostileDetailDialogProps) {
  if (!profile) return null;

  const activityByHour = profile.activity_by_hour ?? {};
  const maxActivity = Math.max(
    ...Object.values(activityByHour).map(Number),
    1,
  );

  const shipEntries = Object.entries(profile.preferred_ship_types ?? {})
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-pochven-surface border-pochven-border text-gray-300">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img
              src={
                profile.entity_type === 'character'
                  ? `https://images.evetech.net/characters/${profile.entity_id}/portrait?size=64`
                  : profile.entity_type === 'corporation'
                    ? `https://images.evetech.net/corporations/${profile.entity_id}/logo?size=64`
                    : `https://images.evetech.net/alliances/${profile.entity_id}/logo?size=64`
              }
              alt=""
              className="w-10 h-10 rounded-full bg-black/30 flex-shrink-0"
            />
            <DialogTitle className="text-gray-200">
              {profile.entity_name}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Entity type badge */}
          <div>
            <span
              className={cn(
                'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold',
                'border-pochven-border bg-pochven-surface',
              )}
            >
              {getEntityTypeLabel(profile.entity_type)}
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
              <div className="text-gray-400">Total Kills</div>
              <div className="text-lg font-medium text-gray-200">
                {(profile.total_kills ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
              <div className="text-gray-400">Total Losses</div>
              <div className="text-lg font-medium text-gray-200">
                {(profile.total_losses ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
              <div className="text-gray-400">ISK Destroyed</div>
              <div className="text-lg font-medium text-gray-200">
                {((profile.total_isk_destroyed ?? 0) / 1e9).toFixed(2)}B
              </div>
            </div>
            <div className="rounded border border-pochven-border bg-pochven-bg/50 p-3">
              <div className="text-gray-400">Threat Score</div>
              <div className="text-lg font-medium text-gray-200">
                {(profile.threat_score ?? 0).toFixed(1)}
              </div>
            </div>
            <div className="col-span-2 rounded border border-pochven-border bg-pochven-bg/50 p-3">
              <div className="text-gray-400">Avg Fleet Size</div>
              <div className="text-lg font-medium text-gray-200">
                {(profile.avg_fleet_size ?? 0).toFixed(1)}
              </div>
            </div>
          </div>

          {/* Activity heatmap placeholder - 24-column grid */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-400">
              Activity by Hour (UTC)
            </h4>
            <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5">
              {Array.from({ length: 24 }, (_, hour) => {
                const count = Number(activityByHour[String(hour)] ?? 0);
                const intensity = maxActivity > 0 ? count / maxActivity : 0;
                const opacity = 0.2 + intensity * 0.8;
                return (
                  <div
                    key={hour}
                    className="flex flex-col items-center gap-0.5"
                    title={`${hour}:00 - ${count} activities`}
                  >
                    <div
                      className="h-6 w-full min-w-[12px] rounded-sm bg-pochven-accent transition-opacity"
                      style={{ opacity }}
                    />
                    <span className="text-[10px] text-gray-500">{hour}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ship breakdown */}
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-400">
              Ship Breakdown
            </h4>
            {shipEntries.length === 0 ? (
              <p className="text-sm text-gray-500">No ship data available</p>
            ) : (
              <ul className="space-y-1.5 rounded border border-pochven-border bg-pochven-bg/50 p-3">
                {shipEntries.map(({ id, count }) => (
                  <li
                    key={id}
                    className="flex items-center gap-2 text-sm text-gray-300"
                  >
                    <img
                      src={`https://images.evetech.net/types/${id}/render?size=64`}
                      alt=""
                      className="w-7 h-7 rounded bg-black/30 flex-shrink-0"
                      loading="lazy"
                    />
                    <span className="flex-1 truncate">Type #{id}</span>
                    <span className="font-medium text-gray-200 flex-shrink-0">{count} uses</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
