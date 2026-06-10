const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:Liconghe1985%40@db.atexvoyvnnuaonvrgzhn.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase');

  // Check which tables already exist
  const existRes = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('team_industry_profile', 'okr_seasons', 'budgets', 'cost_entries', 'effectiveness_metrics', 'performance_reviews', 'ai_suggestions')
    ORDER BY table_name;
  `);
  console.log('Existing tables:', existRes.rows.map(r => r.table_name));

  // Check if is_team_member / is_team_admin functions exist
  const funcRes = await client.query(`
    SELECT proname FROM pg_proc 
    WHERE proname IN ('is_team_member', 'is_team_admin', 'is_any_team_admin')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  `);
  console.log('Helper functions:', funcRes.rows.map(r => r.proname));

  // Create remaining tables that don't exist yet
  const existing = new Set(existRes.rows.map(r => r.table_name));
  const tables = ['okr_seasons', 'budgets', 'cost_entries', 'effectiveness_metrics', 'performance_reviews', 'ai_suggestions'];

  for (const table of tables) {
    if (existing.has(table)) {
      console.log(`✓ ${table} already exists, skipping DDL`);
      continue;
    }
    console.log(`\n--- Creating ${table} ---`);
    switch (table) {
      case 'okr_seasons':
        await client.query(`
          CREATE TABLE okr_seasons (
            id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name text NOT NULL,
            type text NOT NULL DEFAULT 'quarter',
            start_date date NOT NULL,
            end_date date NOT NULL,
            status text NOT NULL DEFAULT 'draft',
            team_id text NOT NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_season_type CHECK (type IN ('quarter', 'annual', 'custom')),
            CONSTRAINT chk_season_status CHECK (status IN ('draft', 'planning', 'executing', 'scoring', 'reviewing', 'closed')),
            CONSTRAINT chk_season_dates CHECK (end_date > start_date)
          );
        `);
        break;
      case 'budgets':
        await client.query(`
          CREATE TABLE budgets (
            id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            team_id text NOT NULL,
            project_id text,
            season_id text,
            name text NOT NULL,
            total_amount numeric NOT NULL DEFAULT 0,
            currency text NOT NULL DEFAULT 'CNY',
            status text NOT NULL DEFAULT 'draft',
            items jsonb NOT NULL DEFAULT '[]'::jsonb,
            approved_by text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_budget_status CHECK (status IN ('draft', 'approved', 'active', 'closed'))
          );
        `);
        break;
      case 'cost_entries':
        await client.query(`
          CREATE TABLE cost_entries (
            id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            team_id text NOT NULL,
            project_id text,
            task_id text,
            category text NOT NULL DEFAULT 'other',
            amount numeric NOT NULL DEFAULT 0,
            description text NOT NULL DEFAULT '',
            recorded_by text,
            recorded_at timestamptz DEFAULT now(),
            approved_by text,
            status text NOT NULL DEFAULT 'pending',
            created_at timestamptz DEFAULT now(),
            CONSTRAINT chk_cost_category CHECK (category IN ('labor', 'material', 'outsourcing', 'travel', 'other')),
            CONSTRAINT chk_cost_status CHECK (status IN ('pending', 'approved', 'rejected'))
          );
        `);
        break;
      case 'effectiveness_metrics':
        await client.query(`
          CREATE TABLE effectiveness_metrics (
            id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            team_id text NOT NULL,
            season_id text,
            goal_id text,
            metric_type text NOT NULL DEFAULT 'effectiveness',
            metric_name text NOT NULL,
            planned_value numeric,
            actual_value numeric,
            unit text DEFAULT '',
            period text DEFAULT '',
            measured_at timestamptz DEFAULT now(),
            created_at timestamptz DEFAULT now()
          );
        `);
        break;
      case 'performance_reviews':
        await client.query(`
          CREATE TABLE performance_reviews (
            id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            team_id text NOT NULL,
            season_id text,
            reviewee_id text NOT NULL,
            status text NOT NULL DEFAULT 'pending',
            self_review jsonb,
            peer_reviews jsonb DEFAULT '[]'::jsonb,
            manager_review jsonb,
            direct_report_reviews jsonb DEFAULT '[]'::jsonb,
            ai_summary text,
            final_score numeric,
            created_at timestamptz DEFAULT now(),
            completed_at timestamptz,
            CONSTRAINT chk_review_status CHECK (status IN ('pending', 'in_progress', 'completed'))
          );
        `);
        break;
      case 'ai_suggestions':
        await client.query(`
          CREATE TABLE ai_suggestions (
            id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
            team_id text NOT NULL,
            user_id text,
            suggestion_type text NOT NULL DEFAULT 'general',
            context_type text,
            context_id text,
            content text NOT NULL DEFAULT '',
            action_payload jsonb,
            status text NOT NULL DEFAULT 'pending',
            source text NOT NULL DEFAULT 'local',
            created_at timestamptz DEFAULT now(),
            resolved_at timestamptz,
            CONSTRAINT chk_suggestion_status CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
            CONSTRAINT chk_suggestion_source CHECK (source IN ('local', 'llm'))
          );
        `);
        break;
    }
    console.log(`✓ ${table} created`);
  }

  // Now set up RLS for ALL 7 tables using correct pattern
  console.log('\n=== Setting up RLS policies ===');
  const allTables = ['team_industry_profile', 'okr_seasons', 'budgets', 'cost_entries', 'effectiveness_metrics', 'performance_reviews', 'ai_suggestions'];

  for (const table of allTables) {
    console.log(`\n--- RLS for ${table} ---`);
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

    // Drop existing failed policies first
    const policies = await client.query(`
      SELECT policyname FROM pg_policies WHERE tablename = '${table}' AND schemaname = 'public';
    `);
    for (const p of policies.rows) {
      await client.query(`DROP POLICY IF EXISTS "${p.policyname}" ON ${table}`);
      console.log(`  Dropped old policy: ${p.policyname}`);
    }

    // Create read policy: team members can read
    await client.query(`
      CREATE POLICY "${table}_team_read" ON ${table}
        FOR SELECT USING (
          team_id = current_setting('app.current_team', true)
        );
    `);
    console.log(`  ✓ team_read policy`);

    // Create write policy: admin/manager can write
    await client.query(`
      CREATE POLICY "${table}_admin_write" ON ${table}
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM members m
            WHERE m.id = (auth.uid())::text
            AND m.role IN ('admin', 'manager', 'leader')
          )
        );
    `);
    console.log(`  ✓ admin_write policy`);

    // Create insert policy: allow inserts from team members
    await client.query(`
      CREATE POLICY "${table}_team_insert" ON ${table}
        FOR INSERT WITH CHECK (
          team_id = current_setting('app.current_team', true)
        );
    `);
    console.log(`  ✓ team_insert policy`);
  }

  // Verify all tables and policies
  console.log('\n=== Verification ===');
  const verRes = await client.query(`
    SELECT t.table_name, 
           (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.table_name AND p.schemaname = 'public') as policy_count
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
    AND t.table_name IN ('team_industry_profile', 'okr_seasons', 'budgets', 'cost_entries', 'effectiveness_metrics', 'performance_reviews', 'ai_suggestions')
    ORDER BY t.table_name;
  `);
  for (const r of verRes.rows) {
    console.log(`  ${r.table_name}: ${r.policy_count} policies`);
  }

  await client.end();
  console.log('\nDone!');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
