/**
 * FieldEditIndicator — Shows when another user is editing a field
 *
 * Displayed inline next to form fields in ItemDetailPanel.
 * Uses the field lock system from collab.ts.
 */
import React from 'react';
import type { FieldLock } from '@/lib/collab';

interface FieldEditIndicatorProps {
  lock: FieldLock | undefined;
}

export const FieldEditIndicator: React.FC<FieldEditIndicatorProps> = ({ lock }) => {
  if (!lock) return null;
  // Auto-expire after 30s
  if (Date.now() - lock.acquiredAt > 30000) return null;

  return (
    <div className="flex items-center gap-1 ml-1 animate-pulse">
      <div
        className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold ring-1 ring-amber-300"
        style={{ backgroundColor: lock.color }}
      >
        {lock.userName.charAt(0)}
      </div>
      <span className="text-[10px] text-amber-600 font-medium whitespace-nowrap">
        {lock.userName}正在编辑
      </span>
    </div>
  );
};
