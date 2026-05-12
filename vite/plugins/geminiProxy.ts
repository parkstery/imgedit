import type { Connect, Plugin, ResolvedConfig } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY_BYTES = 12 * 1024 * 1024;

/** NOT_FOUND 시 순차 시도(문서 기준 안정·저지연 위주). `.env.local`의 GEMINI_MODEL이 있으면 맨 앞에 둡니다. */
const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-1.5-flash',
  'gemini-flash-latest',
] as const;

function normalizeModelId(raw: string): string | null {
  const id = raw.replace(/^models\//i, '').trim();
  if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(id)) return null;
  return id;
}

function buildModelCandidates(env: Record<string, string>): string[] {
  const user = normalizeModelId(env.GEMINI_MODEL?.trim() || '');
  const seed: string[] = [];
  if (user) seed.push(user);
  for (const m of GEMINI_MODEL_FALLBACKS) {
    if (!seed.includes(m)) seed.push(m);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of seed) {
    const id = normalizeModelId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : ['gemini-2.5-flash'];
}

function isModelNotFound(httpStatus: number, parsed: unknown): boolean {
  if (httpStatus === 404) return true;
  if (!parsed || typeof parsed !== 'object') return false;
  const err = (parsed as { error?: { status?: string } }).error;
  return err?.status === 'NOT_FOUND';
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

    const modelCandidates = buildModelCandidates(env);
    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: geminiParts }],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.35,
      },
    });

    try {
      const tried: string[] = [];

      for (const modelId of modelCandidates) {
        tried.push(modelId);
        const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const upstream = await fetch(upstreamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

        const text = await upstream.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          if (!upstream.ok && isModelNotFound(upstream.status, null)) continue;
          if (!upstream.ok) {
            sendJson(res, upstream.status >= 500 ? 502 : 400, {
              error: `Gemini 오류 응답(비JSON, ${upstream.status}): ${text.slice(0, 280)}`,
            });
            return;
          }
          sendJson(res, 502, { error: 'Gemini 본문 JSON 파싱 실패' });
          return;
        }

        if (!upstream.ok) {
          if (isModelNotFound(upstream.status, parsed)) {
            continue;
          }
          let msg =
            (parsed as { error?: { message?: string; status?: string } })?.error?.message ??
            `Gemini API 오류 (${upstream.status})`;
          if (/not\s*found|NOT_FOUND/i.test(msg)) {
            msg += ` (모델: ${modelId})`;
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
        return;
      }

      sendJson(res, 502, {
        error: `Gemini NOT_FOUND: 이 API 키로 사용할 수 있는 모델을 찾지 못했습니다. 시도한 모델: ${tried.join(', ')}. https://aistudio.google.com/apikey 에서 키를 확인하고, https://ai.google.dev/gemini-api/docs/models 에서 모델 코드를 확인한 뒤 .env.local에 GEMINI_MODEL=모델코드 를 지정하세요.`,
      });
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
