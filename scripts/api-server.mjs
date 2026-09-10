import http from 'node:http';
import { readFile, open, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { generateArticle, DurableBudgetLedger, GenerationError, PRICING } from '../generation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicFiles = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/app.mjs', ['app.mjs', 'text/javascript']], ['/core.mjs', ['core.mjs', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']]]);
function authorized(header, token) {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7)); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createStudioServer({ apiKey = process.env.OPENAI_API_KEY, accessToken = process.env.STUDIO_ACCESS_TOKEN, ledger, generate = generateArticle } = {}) {
  const configured = Boolean(apiKey && accessToken?.length >= 24 && ledger);
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/config') return json(200, { configured, authorizationRequired: true, defaultGenerateImages: true, pricing: PRICING });
      if (req.method === 'POST' && path === '/api/generate') {
        if (!configured) return json(503, { code: 'NOT_CONFIGURED', error: 'AI 서버 연결 및 예산·접근 설정이 필요합니다.' });
        if (!authorized(req.headers.authorization, accessToken)) return json(401, { code: 'UNAUTHORIZED', error: '스튜디오 접근 토큰이 필요합니다. OpenAI API 키를 입력하지 마세요.' });
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(403, { error: '다른 사이트에서의 생성 요청을 차단했습니다.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON 요청이 필요합니다.' });
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > 20000) return json(413, { error: '입력 자료가 너무 큽니다.' }); chunks.push(chunk); }
        let input; try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { return json(400, { error: '잘못된 JSON입니다.' }); }
        if (!input || Array.isArray(input) || typeof input !== 'object') return json(400, { error: '입력 형식이 맞지 않습니다.' });
        return json(200, await generate(input, { apiKey, ledger }));
      }
      if (req.method !== 'GET' || !publicFiles.has(path)) return json(404, { error: '찾을 수 없습니다.' });
      const [file, type] = publicFiles.get(path);
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(await readFile(resolve(root, file)));
    } catch (error) { json(error instanceof GenerationError ? error.status : 500, { code: error.code ?? 'SERVER_ERROR', error: error instanceof GenerationError ? error.message : '서버 처리 오류입니다. 관리자에게 문의해 주세요.' }); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ledgerPath = process.env.STUDIO_LEDGER_PATH;
  let lock;
  if (ledgerPath) {
    await mkdir(dirname(resolve(ledgerPath)), { recursive: true });
    // A second process must not bypass the ledger's serialized reservation queue.
    lock = await open(`${ledgerPath}.lock`, 'wx', 0o600);
  }
  const server = createStudioServer({ ledger: ledgerPath ? new DurableBudgetLedger(ledgerPath) : undefined });
  server.listen(Number(process.env.PORT ?? 4173), process.env.HOST ?? '127.0.0.1', () => console.log('Blog Studio API pilot is listening. No credentials are logged.'));
  const stop = () => server.close(async () => { if (lock) { await lock.close(); await unlink(`${ledgerPath}.lock`); } process.exit(0); });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
