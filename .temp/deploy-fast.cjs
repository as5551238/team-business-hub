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

  // Get latest commit
  const mainRef = await apiRequest('GET', '/git/ref/heads/main');
  const latestSha = mainRef.data.object.sha;
  console.log('Latest commit:', latestSha);

  // Get current tree
  const commitData = await apiRequest('GET', `/git/commits/${latestSha}`);
  const rootTreeSha = commitData.data.tree.sha;

  // Get tree contents to find existing assets tree
  const treeData = await apiRequest('GET', `/git/trees/${rootTreeSha}`);
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
    const ext = path.extname(file.relPath);
    const isBinary = ['.png', '.jpg', '.jpeg', '.webp', '.woff2', '.woff'].includes(ext);
    let result;
    if (isBinary) {
      const b64 = fs.readFileSync(file.fullPath).toString('base64');
      result = await createBlobBinary(b64);
    } else {
      const content = fs.readFileSync(file.fullPath, 'utf-8');
      result = await createBlob(content);
    }
    blobMap.set(file.relPath, result.data.sha);
    counter++;
    if (counter % 10 === 0) process.stdout.write(`  Progress: ${counter}/${distFiles.length}\n`);
  }
  process.stdout.write(`  Progress: ${counter}/${distFiles.length}\n`);

  // Create assets tree
  const assetsTreeItems = Array.from(blobMap.entries()).map(([path, sha]) => {
    const ext = path.split('.').pop();
    const mode = '100644';
    const type = 'blob';
    return { mode, type, path, sha };
  });

  const assetsTreeResult = await apiRequest('POST', '/git/trees', { tree: assetsTreeItems });
  console.log('Assets tree:', assetsTreeResult.data.sha);

  // Build root tree (keep other files from current tree)
  const keepEntries = treeData.data.tree.filter(e => e.path !== 'assets' && e.path !== 'index.html');
  const rootTreeItems = [
    ...keepEntries.map(e => ({ mode: e.mode, type: e.type, path: e.path, sha: e.sha })),
    { mode: '040000', type: 'tree', path: 'assets', sha: assetsTreeResult.data.sha },
  ];

  // Add index.html
  const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');
  const indexBlob = await createBlob(indexHtml);
  rootTreeItems.push({ mode: '100644', type: 'blob', path: 'index.html', sha: indexBlob.data.sha });

  // Add .nojekyll
  const nojekyllBlob = await createBlob('');
  rootTreeItems.push({ mode: '100644', type: 'blob', path: '.nojekyll', sha: nojekyllBlob.data.sha });

  const rootTreeResult = await apiRequest('POST', '/git/trees', { tree: rootTreeItems });
  console.log('Root tree:', rootTreeResult.data.sha);

  // Create commit
  const newCommit = await apiRequest('POST', '/git/commits', {
    message: 'deploy: AI proxy + import fixes',
    tree: rootTreeResult.data.sha,
    parents: [latestSha],
  });
  console.log('New commit:', newCommit.data.sha);

  // Update main ref
  await apiRequest('PATCH', '/git/refs/heads/main', { sha: newCommit.data.sha, force: true });

  console.log('\n=== Deploy Complete ===');
  console.log('Site: https://as5551238.github.io/team-business-hub/');
}

main().catch(e => { console.error(e); process.exit(1); });
