import type { Connect, Plugin, ResolvedConfig } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY_BYTES = 12 * 1024 * 1024;
/** Google 쪽에서 모델이 폐기되면 NOT_FOUND가 납니다. `.env.local`의 GEMINI_MODEL로 재정의하세요. */
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';

function resolveGeminiModel(env: Record<string, string>): string {
  const raw = (env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL).replace(/^models\//i, '');
  if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(raw)) return DEFAULT_GEMINI_MODEL;
  return raw;
}

type ClientPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; base64: string };

interface ClientPayload {
  parts: ClientPart[];
}

function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function toGeminiParts(parts: ClientPart[]): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
  const out: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
  for (const p of parts) {
    if (p.type === 'text') {
      const t = p.text.trim();
      if (t) out.push({ text: t });
    } else if (p.type === 'image') {
      const mime = p.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      out.push({
        inline_data: {
          mime_type: mime,
          data: p.base64.replace(/\s/g, ''),
        },
      });
    }
  }
  return out;
}

function extractTextFromGeminiResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
  };
  if (d.error?.message) {
    throw new Error(d.error.message);
  }
  const block = d.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`프롬프트가 차단되었습니다: ${block}`);
  }
  const parts = d.candidates?.[0]?.content?.parts;
  if (!parts?.length) return '';
  return parts.map(p => p.text ?? '').join('');
}

function installGeminiMiddleware(middlewares: Connect.Server, getEnv: () => Record<string, string>): void {
  middlewares.use(async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/gemini/generate') || req.method !== 'POST') {
      next();
      return;
    }

    const env = getEnv();
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      sendJson(res, 503, {
        error: 'GEMINI_API_KEY가 설정되지 않았습니다. 프로젝트 루트에 .env.local 파일을 만들고 GEMINI_API_KEY=발급키 형식으로 넣은 뒤 개발 서버를 다시 시작하세요.',
      });
      return;
    }

    let raw: string;
    try {
      raw = await readRequestBody(req, MAX_BODY_BYTES);
    } catch (e) {
      sendJson(res, 400, { error: e instanceof Error ? e.message : '본문 읽기 실패' });
      return;
    }

    let payload: ClientPayload;
    try {
      payload = JSON.parse(raw) as ClientPayload;
    } catch {
      sendJson(res, 400, { error: 'JSON 형식이 아닙니다.' });
      return;
    }

    if (!payload.parts || !Array.isArray(payload.parts) || payload.parts.length === 0) {
      sendJson(res, 400, { error: 'parts 배열이 필요합니다.' });
      return;
    }

    const geminiParts = toGeminiParts(payload.parts);
    if (geminiParts.length === 0) {
      sendJson(res, 400, { error: '유효한 텍스트 또는 이미지가 없습니다.' });
      return;
    }

    const modelId = resolveGeminiModel(env);
    const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: geminiParts }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.35,
          },
        }),
      });

      const text = await upstream.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        sendJson(res, 502, { error: `Gemini 응답 파싱 실패 (${upstream.status})` });
        return;
      }

      if (!upstream.ok) {
        let msg =
          (parsed as { error?: { message?: string; status?: string } })?.error?.message ??
          `Gemini API 오류 (${upstream.status})`;
        if (/not\s*found|NOT_FOUND/i.test(msg)) {
          msg += ` (모델: ${modelId}) — .env.local에 GEMINI_MODEL=gemini-2.5-flash 등 사용 가능한 모델 ID를 넣고 개발 서버를 다시 시작해 보세요.`;
        }
        sendJson(res, upstream.status >= 500 ? 502 : 400, { error: msg });
        return;
      }

      const reply = extractTextFromGeminiResponse(parsed);
      if (!reply.trim()) {
        sendJson(res, 502, { error: '모델이 빈 응답을 반환했습니다.' });
        return;
      }

      sendJson(res, 200, { text: reply });
    } catch (e) {
      sendJson(res, 502, {
        error: e instanceof Error ? e.message : 'Gemini 요청 중 오류가 발생했습니다.',
      });
    }
  });
}

export function geminiProxy(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'gemini-proxy',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      installGeminiMiddleware(server.middlewares, () => loadEnv(config.mode, config.envDir, ''));
    },
    configurePreviewServer(server) {
      installGeminiMiddleware(server.middlewares, () => loadEnv(config.mode, config.envDir, ''));
    },
  };
}
