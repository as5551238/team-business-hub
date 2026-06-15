/**
 * Fast Deploy via GitHub Git Data API
 * Uploads dist/ contents to as5551238/team-business-hub repo root for GitHub Pages
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_TOKEN = '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';
const OWNER = 'as5551238';
const REPO = 'team-business-hub';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const API = 'api.github.com';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function apiRequestWithRetry(method, urlPath, body = null, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const result = await apiRequest(method, urlPath, body);
    if (result.status === 401 && i < retries - 1) {
      console.log(`  Retry ${i+1} for ${method} ${urlPath} (401)`);
      await delay(2000 * (i + 1));
      continue;
    }
    if (result.status >= 500 && i < retries - 1) {
      console.log(`  Retry ${i+1} for ${method} ${urlPath} (${result.status})`);
      await delay(3000 * (i + 1));
      continue;
    }
    return result;
  }
}

function apiRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: API,
      path: `/repos/${OWNER}/${REPO}${urlPath}`,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'deploy-script',
        'Accept': 'application/vnd.github+json',
      },
    };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(opts, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, data: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function createBlob(content) {
  return apiRequest('POST', '/git/blobs', { content, encoding: 'utf-8' });
}

function createBlobBinary(b64) {
  return apiRequest('POST', '/git/blobs', { content: b64, encoding: 'base64' });
}

async function main() {
  console.log('=== Fast Deploy via Git Data API ===\n');

  // Get latest gh-pages commit as base
  const ghPagesRef = await apiRequestWithRetry('GET', '/git/ref/heads/gh-pages');
  const latestSha = ghPagesRef.data.object.sha;
  console.log('Latest gh-pages commit:', latestSha);

  // Get current tree
  const commitData = await apiRequestWithRetry('GET', `/git/commits/${latestSha}`);
  const rootTreeSha = commitData.data.tree.sha;

  // Get tree contents to find existing assets tree
  const treeData = await apiRequestWithRetry('GET', `/git/trees/${rootTreeSha}`);
  const assetsEntry = treeData.data.tree.find(e => e.path === 'assets');
  
  // Create blobs for all dist files
  const distFiles = [];
  function walkDir(dir, base = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walkDir(fullPath, relPath);
      else distFiles.push({ fullPath, relPath });
    }
  }
  walkDir(DIST_DIR);

  console.log(`Creating blobs for ${distFiles.length} files...`);
  const blobMap = new Map();
  let counter = 0;
  for (const file of distFiles) {
    const raw = fs.readFileSync(file.fullPath);
    const b64 = raw.toString('base64');
    const result = await apiRequestWithRetry('POST', '/git/blobs', { content: b64, encoding: 'base64' });
    if (!result.data?.sha) {
      console.error(`  FAILED blob for ${file.relPath}: status=${result.status} err=${JSON.stringify(result.data).substring(0, 200)}`);
    }
    blobMap.set(file.relPath, result.data?.sha);
    counter++;
    if (counter % 10 === 0) process.stdout.write(`  Progress: ${counter}/${distFiles.length}\n`);
    await delay(200); // throttle to avoid rate limit
  }
  process.stdout.write(`  Progress: ${counter}/${distFiles.length}\n`);

  // Check all blobs succeeded
  const failedBlobs = Array.from(blobMap.entries()).filter(([_, sha]) => !sha);
  if (failedBlobs.length > 0) {
    console.error(`\n${failedBlobs.length} blobs failed, aborting deploy`);
    process.exit(1);
  }

  // Create assets tree
  const assetsTreeItems = Array.from(blobMap.entries()).map(([path, sha]) => {
    const ext = path.split('.').pop();
    const mode = '100644';
    const type = 'blob';
    return { mode, type, path, sha };
  });

  const assetsTreeResult = await apiRequestWithRetry('POST', '/git/trees', { tree: assetsTreeItems });
  console.log('Assets tree status:', assetsTreeResult.status, 'sha:', assetsTreeResult.data?.sha);
  if (!assetsTreeResult.data?.sha) {
    console.error('Assets tree creation failed:', JSON.stringify(assetsTreeResult.data).substring(0, 500));
    process.exit(1);
  }

  // Build root tree (keep other files from current tree)
  const keepEntries = treeData.data.tree.filter(e => e.path !== 'assets' && e.path !== 'index.html');
  const rootTreeItems = [
    ...keepEntries.map(e => ({ mode: e.mode, type: e.type, path: e.path, sha: e.sha })),
    { mode: '040000', type: 'tree', path: 'assets', sha: assetsTreeResult.data.sha },
  ];

  // Add index.html
  const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');
  const indexBlob = await apiRequestWithRetry('POST', '/git/blobs', { content: Buffer.from(indexHtml).toString('base64'), encoding: 'base64' });
  rootTreeItems.push({ mode: '100644', type: 'blob', path: 'index.html', sha: indexBlob.data?.sha });

  // Add .nojekyll
  const nojekyllBlob = await apiRequestWithRetry('POST', '/git/blobs', { content: '', encoding: 'utf-8' });
  rootTreeItems.push({ mode: '100644', type: 'blob', path: '.nojekyll', sha: nojekyllBlob.data?.sha });

  const rootTreeResult = await apiRequestWithRetry('POST', '/git/trees', { tree: rootTreeItems });
  console.log('Root tree status:', rootTreeResult.status, 'sha:', rootTreeResult.data?.sha);
  if (!rootTreeResult.data?.sha) {
    console.error('Root tree creation failed:', JSON.stringify(rootTreeResult.data).substring(0, 500));
    process.exit(1);
  }

  // Create commit
  const newCommit = await apiRequest('POST', '/git/commits', {
    message: 'deploy: TBH latest build',
    tree: rootTreeResult.data.sha,
    parents: [latestSha],
  });
  console.log('New commit status:', newCommit.status, 'sha:', newCommit.data?.sha);
  if (!newCommit.data?.sha) {
    console.error('Commit creation failed:', JSON.stringify(newCommit.data).substring(0, 500));
    process.exit(1);
  }

  // Update gh-pages ref
  const refResult = await apiRequest('PATCH', '/git/refs/heads/gh-pages', { sha: newCommit.data.sha, force: true });
  console.log('Ref update status:', refResult.status);

  console.log('\n=== Deploy Complete ===');
  console.log('Site: https://as5551238.github.io/team-business-hub/');
}

main().catch(e => { console.error(e); process.exit(1); });
