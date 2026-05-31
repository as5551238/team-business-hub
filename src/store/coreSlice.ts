import type { AppState } from '@/types';
import type { Action } from './types';
import { memberReducer } from './memberSlice';
import { commentReducer } from './commentSlice';
import { notificationReducer } from './notificationSlice';
import { tagCategoryReducer } from './tagCategorySlice';
import { settingsReducer } from './settingsSlice';
import { sprintReducer } from './sprintSlice';
import { contentReducer } from './contentSlice';

export function coreReducer(state: AppState, action: Action): AppState | null {
  const r1 = notificationReducer(state, action); if (r1 !== null) return r1;
  const r2 = memberReducer(state, action); if (r2 !== null) return r2;
  const r3 = tagCategoryReducer(state, action); if (r3 !== null) return r3;
  const r4 = commentReducer(state, action); if (r4 !== null) return r4;
  const r5 = settingsReducer(state, action); if (r5 !== null) return r5;
  const r6 = sprintReducer(state, action); if (r6 !== null) return r6;
  const r7 = contentReducer(state, action); if (r7 !== null) return r7;
  return null;
}
