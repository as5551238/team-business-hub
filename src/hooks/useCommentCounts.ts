import { useMemo } from 'react';
import type { Comment } from '@/types';

/** Pre-computed comment counts per item for a given item type.
 *  Accepts comments array as param to avoid cross-chunk useStoreSelector TDZ issues. */
export function useCommentCounts(itemType: 'goal' | 'task' | 'project', comments: Comment[]): Record<string, number> {
  return useMemo(() => {
    const counts: Record<string, number> = {};
    (comments || []).forEach((c: Comment) => {
      if (c.itemType === itemType) counts[c.itemId] = (counts[c.itemId] || 0) + 1;
    });
    return counts;
  }, [comments, itemType]);
}
