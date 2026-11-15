// One fixed Workers AI model on the Workers Free plan. No gateway, model
// selection, retry, or paid fallback is exposed to callers.
export const FREE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export class AIProviderError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function cleanSecret(val) {
  let s = String(val || '').trim();
  const eq = s.indexOf('=');
  if (eq > 0 && eq < 40 && !s.includes(' ')) {
    s = s.slice(eq + 1).trim();
  }
  return s.replace(/^["']|["']$/g, '').trim();
}

export function isFreeAIConfigured(env) {
  const plan = cleanSecret(env('MOTION_AI_CLOUDFLARE_PLAN')).toLowerCase();
  const accountId = cleanSecret(env('CLOUDFLARE_ACCOUNT_ID'));
  const token = cleanSecret(env('CLOUDFLARE_AI_TOKEN'));
  const planOk = !plan || plan === 'workers-free';
  const accountOk = /^[a-f0-9]{32}$/i.test(accountId);
  const tokenOk = Boolean(token);
  if (!planOk || !accountOk || !tokenOk) {
    console.error(`[AI config check failed] plan="${plan}" (ok: ${planOk}), accountId="${accountId ? accountId.slice(0, 6) + '...' : ''}" (length: ${accountId.length}, ok: ${accountOk}), tokenPresent=${tokenOk}`);
    return false;
  }
  return true;
}

export async function requestFreeAI({env, fetchImpl, messages, json = false, maxTokens = 2048}) {
  if (!isFreeAIConfigured(env)) {
    throw new AIProviderError(503, 'AI_NOT_CONFIGURED', 'AI is not activated yet. The workspace administrator needs to finish the free AI setup.');
  }
  const accountId = cleanSecret(env('CLOUDFLARE_ACCOUNT_ID'));
  const token = cleanSecret(env('CLOUDFLARE_AI_TOKEN'));
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${FREE_MODEL}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({messages, max_tokens: maxTokens, temperature: 0.4, ...(json ? {response_format: {type: 'json_object'}} : {})})
  });
  if (response.status === 429) {
    throw new AIProviderError(429, 'FREE_LIMIT_REACHED', 'The free AI allowance is exhausted or temporarily busy. Please try again later. No paid service will be used.');
  }
  if (!response.ok) {
    const code = response.status === 401 ? 'KEY_REJECTED' : response.status === 403 ? 'MODEL_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE';
    throw new AIProviderError(503, code, 'AI is temporarily unavailable. Please try again later.');
  }
  let payload;
  try { payload = await response.json(); } catch {
    throw new AIProviderError(502, 'INVALID_DRAFT', 'AI returned an unreadable response. Please try again.');
  }
  if (payload?.success !== true || payload?.errors?.length) {
    throw new AIProviderError(503, 'PROVIDER_UNAVAILABLE', 'AI is temporarily unavailable. Please try again later.');
  }
  const output = payload.result?.response;
  // Cloudflare turns JSON-looking answers into objects even outside JSON mode; accept both.
  if ((typeof output !== 'string' || !output.trim()) && (!output || typeof output !== 'object' || Array.isArray(output))) {
    throw new AIProviderError(502, 'INVALID_DRAFT', 'AI returned an empty response. Please try again.');
  }
  return output;
}
