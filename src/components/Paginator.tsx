import { useState, useMemo } from 'react';

interface UsePaginationOptions {
  pageSize?: number;
}

interface UsePaginationResult<T> {
  currentItems: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  setPage: (p: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (s: number) => void;
}

export function usePagination<T>(items: T[], options: UsePaginationOptions = {}): UsePaginationResult<T> {
  const pageSize = options.pageSize ?? 20;
  const [page, setPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(pageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / localPageSize));
  const safePage = Math.min(page, totalPages);

  const currentItems = useMemo(
    () => items.slice((safePage - 1) * localPageSize, safePage * localPageSize),
    [items, safePage, localPageSize]
  );

  function handleSetPage(p: number) {
    setPage(Math.max(1, Math.min(p, totalPages)));
  }

  function handleSetPageSize(s: number) {
    setLocalPageSize(s);
    setPage(1);
  }

  return {
    currentItems,
    page: safePage,
    pageSize: localPageSize,
    totalPages,
    totalItems,
    setPage: handleSetPage,
    nextPage: () => handleSetPage(safePage + 1),
    prevPage: () => handleSetPage(safePage - 1),
    setPageSize: handleSetPageSize,
  };
}

import React from 'react';

interface PaginatorProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
}

export function Paginator({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }: PaginatorProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between py-2 text-xs text-muted-foreground">
      <div>
        共 {totalItems} 条，每页
        {onPageSizeChange ? (
          <select
            className="border border-border rounded px-1 py-0.5 mx-1 text-xs"
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        ) : <span className="mx-1">{pageSize}</span>}
        条
      </div>
      <div className="flex items-center gap-1">
        <button
          className="px-2 py-1 rounded hover:bg-accent disabled:opacity-40 transition-colors"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >上一页</button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dot-${i}`} className="px-1">...</span>
          ) : (
            <button
              key={p}
              className={`px-2 py-1 rounded transition-colors ${p === page ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onClick={() => onPageChange(p as number)}
            >{p}</button>
          )
        )}
        <button
          className="px-2 py-1 rounded hover:bg-accent disabled:opacity-40 transition-colors"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >下一页</button>
      </div>
    </div>
  );
}
