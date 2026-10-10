// Shared text LLM adapter: no SDKs, billing keys or provider-specific code in the UI.
// Keep Groq as the default until the real-message benchmark supports switching.
export const DEFAULT_AI_PROVIDER = 'groq';
export const MODEL_PRICES_USD_PER_MILLION = {
  'groq:openai/gpt-oss-120b': { input: 0.15, output: 0.60 },
  'groq:openai/gpt-oss-20b': { input: 0.075, output: 0.30 },
  'openai:gpt-6-luna': { input: 0.10, output: 0.50 }
};
// Cost table is a dated estimate; provider billing remains the source of truth.

export function resolveAIConfig(options = {}) {
  const provider = String(options.provider || process.env.AI_PROVIDER?.trim() || DEFAULT_AI_PROVIDER).toLowerCase();
  if (!['groq','openai'].includes(provider)) throw new Error('AI_PROVIDER must be groq or openai');
  const key = provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
  const model = String(options.model || process.env.AI_MODEL?.trim() ||
    (provider === 'groq' ? process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b' : process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna')).trim();
  if (!model || !/^[\w.\/-]{1,100}$/.test(model)) throw new Error('Invalid AI model name');
  return {
    provider, model, apiKey: key,
    url: provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
  };
}

export function estimateAIUSD({provider,model,usage} = {}) {
  const prices = MODEL_PRICES_USD_PER_MILLION[`${provider}:${model}`];
  if (!prices || !usage) return null;
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  return (promptTokens * prices.input + completionTokens * prices.output) / 1_000_000;
}

export async function requestJSON(prompt, { provider, model, onUsage, onRaw, timeoutMs = 25_000 } = {}) {
  const config = resolveAIConfig({ provider, model });
  if (!config.apiKey) {
    const variable = config.provider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(`${variable} is missing for AI_PROVIDER=${config.provider}`);
  }
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  };
  if (config.provider === 'groq') body.temperature = 0.1;
  if (config.provider === 'openai') {
    // GPT-6 Luna can return a fast JSON answer without invisible reasoning tokens.
    if (config.model === 'gpt-6-luna') body.reasoning_effort = 'none';
    body.max_completion_tokens = 2000;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      // Do not log Authorization headers or prompt contents.
      const detail = (await response.text()).slice(0, 350);
      throw new Error(`${config.provider}/${config.model} HTTP ${response.status}: ${detail}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error(`${config.provider} returned no JSON content`);
    let parsed;
    try { parsed = JSON.parse(content); }
    catch { throw new Error(`${config.provider} returned invalid JSON`); }
    const usage = data.usage ?? null;
    onUsage?.({
      provider: config.provider, model: config.model,
      usage,
      estimatedCostUSD: estimateAIUSD({provider:config.provider,model:config.model,usage})
    });
    onRaw?.(parsed);
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}
