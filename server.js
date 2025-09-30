import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const API_BASE_URL = 'https://api.short.io/api';
const API_KEY = process.env.SHORT_IO_API_KEY;
const SHORT_DOMAIN = process.env.SHORT_IO_DOMAIN;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApiRequest(req, res, url);
    } else {
      await serveStaticFile(res, url.pathname);
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Internal server error' }));
  }
});

async function serveStaticFile(res, pathname) {
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, 'public', filePath);

  if (!fullPath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await fs.promises.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = getContentType(ext);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      throw error;
    }
  }
}

function getContentType(ext) {
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

async function handleApiRequest(req, res, url) {
  if (!API_KEY || !SHORT_DOMAIN) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Missing SHORT_IO_API_KEY or SHORT_IO_DOMAIN environment variables.' }));
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ domain: SHORT_DOMAIN }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/domains') {
      const result = await shortIoRequest('/domains');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/links') {
      const search = url.searchParams.get('search') || '';
      const limit = url.searchParams.get('limit') || '50';
      const pageToken = url.searchParams.get('pageToken');

      const queryParams = new URLSearchParams({
        domain: SHORT_DOMAIN,
        limit,
      });
      if (search) queryParams.set('search', search);
      if (pageToken) queryParams.set('pageToken', pageToken);

      const result = await shortIoRequest(`/links?${queryParams.toString()}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/links') {
      const body = await readJsonBody(req);
      if (!body || !body.originalURL) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'originalURL is required' }));
        return;
      }

      const payload = buildLinkPayload(body, { requireOriginal: true });

      const result = await shortIoRequest('/links', {
        method: 'POST',
        body: payload,
      });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    const linkIdMatch = url.pathname.match(/^\/api\/links\/(.+)$/);
    if (linkIdMatch) {
      const linkId = linkIdMatch[1];

      if (req.method === 'GET') {
        const result = await shortIoRequest(`/links/${linkId}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'PUT' || req.method === 'PATCH') {
        const body = await readJsonBody(req);
        if (!body) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Request body is required' }));
          return;
        }

        const payload = buildLinkPayload(body, { allowPartial: true });
        const result = await shortIoRequest(`/links/${linkId}`, {
          method: 'POST',
          body: payload,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'DELETE') {
        await shortIoRequest(`/links/${linkId}`, { method: 'DELETE' });
        res.writeHead(204).end();
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Endpoint not found' }));
  } catch (error) {
    console.error('Short.io API error', error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 502);
    const payload = {
      message: error.data?.message || error.message || 'Short.io API request failed',
    };
    if (error instanceof SyntaxError) {
      payload.message = 'Invalid JSON payload';
    }
    if (error.data && typeof error.data === 'object' && error.data !== null) {
      payload.details = error.data;
    } else if (typeof error.data === 'string') {
      payload.details = { raw: error.data };
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }
}

async function shortIoRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Authorization': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const error = new Error('Short.io API error');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function buildLinkPayload(input, options = {}) {
  const { requireOriginal = false, allowPartial = false } = options;
  if (!input || typeof input !== 'object') {
    return {
      domain: SHORT_DOMAIN,
    };
  }

  const payload = { domain: SHORT_DOMAIN };

  const fields = {
    originalURL: 'originalURL',
    title: 'title',
    path: 'path',
    redirectType: 'redirectType',
    tags: 'tags',
    utmSource: 'utmSource',
    utmMedium: 'utmMedium',
    utmCampaign: 'utmCampaign',
    utmTerm: 'utmTerm',
    utmContent: 'utmContent',
    iosURL: 'iosURL',
    androidURL: 'androidURL',
    password: 'password',
    description: 'description',
    originalUrl: 'originalURL',
  };

  for (const [key, target] of Object.entries(fields)) {
    if (input[key] === undefined) continue;
    if (input[key] === '' && !['path', 'title', 'description'].includes(key)) continue;
    payload[target] = input[key];
  }

  if (Array.isArray(input.tags)) {
    payload.tags = input.tags;
  } else if (typeof input.tags === 'string' && input.tags.trim()) {
    payload.tags = input.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }

  if (input.redirectType != null) {
    const redirectValue = Number.parseInt(input.redirectType, 10);
    if (!Number.isNaN(redirectValue)) {
      payload.redirectType = redirectValue;
    }
  }

  if (input.allowDuplicates != null) {
    payload.allowDuplicates = Boolean(input.allowDuplicates === true || input.allowDuplicates === 'true' || input.allowDuplicates === '1');
  }

  if ('expiresAt' in input) {
    if (!input.expiresAt) {
      payload.expiresAt = null;
    } else {
      const expires = new Date(input.expiresAt);
      if (!Number.isNaN(expires.getTime())) {
        payload.expiresAt = expires.toISOString();
      }
    }
  }

  if (requireOriginal && !payload.originalURL) {
    throw Object.assign(new Error('originalURL is required'), { status: 400 });
  }

  if (allowPartial && !requireOriginal && !payload.originalURL) {
    delete payload.originalURL;
  }

  return payload;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
