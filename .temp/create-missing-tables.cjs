const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:Liconghe1985%40@db.atexvoyvnnuaonvrgzhn.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase');

  // 1. team_industry_profile — actually used in code
  console.log('\n--- Creating team_industry_profile ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS team_industry_profile (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      team_id text NOT NULL,
      industry_key text NOT NULL,
      industry_name text NOT NULL,
      confirmed_by text,
      confirmed_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_industry_profile_team_id ON team_industry_profile(team_id);
  `);
  console.log('✓ team_industry_profile created');

  await client.query(`
    ALTER TABLE team_industry_profile ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      CREATE POLICY "team_industry_profile_team_read" ON team_industry_profile
        FOR SELECT USING (team_id = current_setting('request.jwt.claims', true)::json->>'team_id');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE POLICY "team_industry_profile_admin_write" ON team_industry_profile
        FOR ALL USING (
          auth.uid()::text IN (
            SELECT user_id FROM user_roles WHERE role IN ('admin', 'manager')
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✓ team_industry_profile RLS enabled');

  // 2. okr_seasons — has complete DDL
  console.log('\n--- Creating okr_seasons ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS okr_seasons (
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
  console.log('✓ okr_seasons created');

  await client.query(`
    ALTER TABLE okr_seasons ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      CREATE POLICY "okr_seasons_team_read" ON okr_seasons
        FOR SELECT USING (team_id = current_setting('request.jwt.claims', true)::json->>'team_id');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE POLICY "okr_seasons_admin_write" ON okr_seasons
        FOR ALL USING (
          auth.uid()::text IN (
            SELECT user_id FROM user_roles WHERE role IN ('admin', 'manager')
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('✓ okr_seasons RLS enabled');

  // 3. budgets
  console.log('\n--- Creating budgets ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS budgets (
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
  console.log('✓ budgets created');

  // 4. cost_entries
  console.log('\n--- Creating cost_entries ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS cost_entries (
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
  console.log('✓ cost_entries created');

  // 5. effectiveness_metrics
  console.log('\n--- Creating effectiveness_metrics ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS effectiveness_metrics (
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
  console.log('✓ effectiveness_metrics created');

  // 6. performance_reviews
  console.log('\n--- Creating performance_reviews ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS performance_reviews (
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
  console.log('✓ performance_reviews created');

  // 7. ai_suggestions
  console.log('\n--- Creating ai_suggestions ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_suggestions (
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
  console.log('✓ ai_suggestions created');

  // Enable RLS for tables 3-7
  console.log('\n--- Enabling RLS for remaining tables ---');
  const rlsTables = ['budgets', 'cost_entries', 'effectiveness_metrics', 'performance_reviews', 'ai_suggestions'];
  for (const table of rlsTables) {
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    // Basic team read policy
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY "${table}_team_read" ON ${table}
          FOR SELECT USING (team_id = current_setting('request.jwt.claims', true)::json->>'team_id');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log(`✓ ${table} RLS enabled`);
  }

  // Verify all tables exist
  console.log('\n--- Verification ---');
  const res = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('team_industry_profile', 'okr_seasons', 'budgets', 'cost_entries', 'effectiveness_metrics', 'performance_reviews', 'ai_suggestions')
    ORDER BY table_name;
  `);
  console.log('Tables found:', res.rows.map(r => r.table_name));

  await client.end();
  console.log('\nDone!');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
