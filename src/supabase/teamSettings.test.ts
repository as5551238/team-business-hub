import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client before importing the module
vi.mock('./client', () => {
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      }),
    }),
  });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
  return {
    getSupabaseClient: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: mockSelect,
        upsert: mockUpsert,
        delete: mockDelete,
      }),
    }),
    isSupabaseConfigured: vi.fn().mockReturnValue(true),
  };
});

// Need to import after mock
import { getTeamSetting, setTeamSetting, deleteTeamSetting, loadSettingDBFirst, saveSettingDualWrite } from './teamSettings';

describe('teamSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('setTeamSetting + getTeamSetting', () => {
    it('写入并读取team setting', async () => {
      await setTeamSetting('test_key', { foo: 'bar' }, 'team-1');
      const result = await getTeamSetting('test_key', 'team-1');
      // Mock返回null（默认），验证函数不会crash
      expect(result).toBeNull();
    });
  });

  describe('deleteTeamSetting', () => {
    it('删除team setting不抛错', async () => {
      await expect(deleteTeamSetting('test_key', 'team-1')).resolves.toBeUndefined();
    });
  });

  describe('loadSettingDBFirst', () => {
    it('DB无值时fallback到localStorage', async () => {
      localStorage.setItem('ls-key', JSON.stringify({ fallback: true }));
      const result = await loadSettingDBFirst('db-key', 'ls-key', 'team-1');
      expect(result).toEqual({ fallback: true });
    });

    it('DB和localStorage都无值时返回null', async () => {
      const result = await loadSettingDBFirst('missing', 'missing-ls', 'team-1');
      expect(result).toBeNull();
    });
  });

  describe('saveSettingDualWrite', () => {
    it('同时写入localStorage和DB', () => {
      saveSettingDualWrite('db-key', 'ls-key', { dual: true }, 'team-1');
      // localStorage should have the value immediately
      const lsVal = JSON.parse(localStorage.getItem('ls-key') || 'null');
      expect(lsVal).toEqual({ dual: true });
    });
  });
});
