/**
 * useShareTarget — 处理 Web Share Target API 接收的分享内容
 * 当其他 App 分享文本/链接到 TBH 时，自动创建任务
 *
 * Manifest 配置 (已在 vite.config.ts 中添加):
 * share_target: { action: "./#/tasks", method: "POST", enctype: "application/x-www-form-urlencoded",
 *   params: { title: "title", text: "text", url: "url" } }
 */
import { useEffect } from 'react';
import { useStore } from '@/store/useStore';

export function useShareTarget() {
  const { dispatch } = useStore();

  useEffect(() => {
    // Handle POST request from Web Share Target
    // The browser navigates to our app with form data
    if (window.location.hash !== '#/tasks') return;

    // Check for shared content in URL params (GET redirect after POST)
    const params = new URLSearchParams(window.location.search);
    const sharedTitle = params.get('title');
    const sharedText = params.get('text');
    const sharedUrl = params.get('url');

    if (!sharedTitle && !sharedText && !sharedUrl) return;

    // Create task from shared content
    const title = sharedTitle || sharedText?.slice(0, 100) || '分享的内容';
    const description = [
      sharedText && sharedTitle ? sharedText : '',
      sharedUrl ? `链接: ${sharedUrl}` : '',
    ].filter(Boolean).join('\n');

    dispatch({
      type: 'ADD_TASK',
      payload: {
        title,
        description,
        projectId: null,
        goalId: null,
        parentId: null,
        status: 'todo',
        priority: 'medium' as const,
        leaderId: '',
        supporterIds: [],
        tags: ['分享'],
        category: '',
        startDate: null,
        dueDate: null,
        reminderDate: null,
        completedAt: null,
        subtasks: [],
        attachments: [],
        trackingRecords: [],
        repeatCycle: 'none',
        summary: '',
      },
    });

    // Clean up URL
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('title');
    cleanUrl.searchParams.delete('text');
    cleanUrl.searchParams.delete('url');
    window.history.replaceState({}, '', cleanUrl.toString());
  }, [dispatch]);
}
