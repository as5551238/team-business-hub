const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:Liconghe1985%40@db.atexvoyvnnuaonvrgzhn.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
async function run() {
  await client.connect();
  // Check existing RLS policies to see the pattern used
  const res = await client.query(`
    SELECT tablename, policyname, cmd, qual 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    LIMIT 15;
  `);
  console.log('Existing RLS policies:');
  for (const r of res.rows) {
    console.log(`  ${r.tablename}.${r.policyname} (${r.cmd}): ${r.qual?.slice(0, 100)}`);
  }
  
  // Check if auth.uid() pattern is used
  const res2 = await client.query(`
    SELECT tablename, policyname, qual 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND qual LIKE '%auth.uid%';
  `);
  console.log('\nauth.uid() policies:');
  for (const r of res2.rows) {
    console.log(`  ${r.tablename}.${r.policyname}: ${r.qual}`);
  }
  
  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
