const { timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { join } = require('node:path');

const page = readFileSync(join(__dirname, 'smoke.html'));
const smokeToken = Buffer.from(process.env.GLITCHTIP_SMOKE_TOKEN || '');
const port = Number(process.env.APP_PORT || 3000);

function sendJson(response, status, body, onFinished) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body), onFinished);
}

createServer((request, response) => {
  const route = request.url.split('?')[0];
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'GET' && route === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return response.end(page);
  }
  if (request.method === 'GET' && route === '/healthz') {
    return sendJson(response, 200, { ok: true });
  }

  const probe = /^\/probe\/(rejection|exception|console|handled-500)$/.exec(route)?.[1];
  if (request.method !== 'POST' || !probe) {
    return sendJson(response, 404, { error: '경로를 찾을 수 없습니다.' });
  }
  if (!smokeToken.length) {
    return sendJson(response, 503, { error: '서비스 환경변수에 GLITCHTIP_SMOKE_TOKEN을 설정하세요.' });
  }
  const token = Buffer.from(request.headers['x-smoke-token'] || '');
  if (token.length !== smokeToken.length || !timingSafeEqual(token, smokeToken)) {
    return sendJson(response, 403, { error: '테스트 토큰을 확인하세요.' });
  }

  const result = { probe, requestedAt: new Date().toISOString() };
  switch (probe) {
    case 'rejection':
      return sendJson(response, 202, result, () => {
        void Promise.reject(new Error('Request timed out'));
      });
    case 'exception':
      return sendJson(response, 202, result, () => {
        setTimeout(function throwBackendSmokeError() {
          const missing = undefined;
          missing.map();
        }, 250);
      });
    case 'console':
      return sendJson(response, 202, result, () => console.error('Network Error'));
    case 'handled-500':
      try {
        throw new Error('API request failed');
      } catch {
        return sendJson(response, 500, result);
      }
  }
}).listen(port, '0.0.0.0', () => console.log(`GlitchTip backend smoke is listening on ${port}`));
