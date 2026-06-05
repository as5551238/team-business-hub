import { useStore } from '@/store/useStore';
import type { SeasonType } from '@/types';

const TYPE_LABELS: Record<SeasonType, string> = { quarter: '季度', annual: '年度', custom: '自定义' };
const LEVEL_LABELS: Record<string, string> = { vision: '愿景', annual: '年度', quarter: '季度' };

interface Props {
  seasonId: string | null;
  strategyLevel: 'vision' | 'annual' | 'quarter' | null;
  goalId: string;
}

export function OKRSeasonSelector({ seasonId, strategyLevel, goalId }: Props) {
  const { state, dispatch } = useStore();
  const seasons = state.seasons || [];
  const activeSeasons = seasons.filter(s => s.status !== 'closed');

  function handleSeasonChange(seasonId: string | null) {
    dispatch({
      type: 'UPDATE_GOAL',
      payload: {
        id: goalId,
        updates: { seasonId, strategyLevel: seasonId ? strategyLevel || 'quarter' : null },
      },
    });
  }

  function handleLevelChange(level: 'vision' | 'annual' | 'quarter' | null) {
    dispatch({
      type: 'UPDATE_GOAL',
      payload: { id: goalId, updates: { strategyLevel: level } },
    });
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-muted-foreground">OKR 赛季</label>
        <select
          className="w-full border border-input rounded px-2 py-1 text-sm mt-1"
          value={seasonId || ''}
          onChange={e => handleSeasonChange(e.target.value || null)}
        >
          <option value="">未关联赛季</option>
          {activeSeasons.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({TYPE_LABELS[s.type]}) - {s.status === 'executing' ? '执行中' : s.status === 'planning' ? '规划中' : s.status}
            </option>
          ))}
          {/* Show current season even if closed */}
          {seasonId && !activeSeasons.find(s => s.id === seasonId) && (() => {
            const closedSeason = seasons.find(s => s.id === seasonId);
            return closedSeason ? <option value={closedSeason.id}>{closedSeason.name} (已关闭)</option> : null;
          })()}
        </select>
      </div>
      {seasonId && (
        <div>
          <label className="text-xs text-muted-foreground">战略层级</label>
          <select
            className="w-full border border-input rounded px-2 py-1 text-sm mt-1"
            value={strategyLevel || ''}
            onChange={e => handleLevelChange((e.target.value || null) as 'vision' | 'annual' | 'quarter' | null)}
          >
            <option value="">未设置</option>
            {Object.entries(LEVEL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
