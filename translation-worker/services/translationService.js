const logger = require('../utils/logger');

const DEFAULT_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';

function resolveApiUrl(rawUrl) {
  const configured = (rawUrl || DEFAULT_API_URL).trim();

  // Already a full endpoint — use as-is
  if (/\/chat\/completions\/?$/i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }

  // Base URL — append the completions path
  return `${configured.replace(/\/+$/, '')}/chat/completions`;
}

function extractTranslatedText(payload) {
  if (!payload) return '';

  const choicesText = payload?.choices?.[0]?.message?.content;
  if (typeof choicesText === 'string' && choicesText.trim()) return choicesText.trim();
  if (Array.isArray(choicesText)) {
    const textParts = choicesText
      .map(part => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean);
    if (textParts.length > 0) {
      return textParts.join('').trim();
    }
  }

  const outputText = payload?.output_text;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();

  const translation = payload?.translation;
  if (typeof translation === 'string' && translation.trim()) return translation.trim();

  return '';
}

function extractProviderErrorMessage(payload) {
  if (!payload) return null;

  if (typeof payload?.error?.message === 'string' && payload.error.message.trim()) {
    return payload.error.message.trim();
  }

  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload?.msg === 'string' && payload.msg.trim()) {
    return payload.msg.trim();
  }

  return null;
}

function getRetryAfterMs(response) {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return null;

  const asSeconds = Number.parseInt(retryAfter, 10);
  if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(retryAfter);
  if (!Number.isNaN(asDate)) {
    const delay = asDate - Date.now();
    return delay > 0 ? delay : 0;
  }

  return null;
}

async function callTranslate({ text, targetLanguage, sourceLanguage = 'auto' }) {
  const apiUrl = resolveApiUrl(process.env.ZAI_API_URL);
  const apiKey = process.env.ZAI_API_KEY;
  const model = process.env.ZAI_MODEL || 'glm-4.7';
  const maxTokens = Number.parseInt(process.env.ZAI_MAX_TOKENS || '2048', 10);
  const timeoutMs = Number.parseInt(process.env.ZAI_TIMEOUT_MS || '60000', 10);

  if (!apiKey) {
    throw new Error('Missing ZAI_API_KEY');
  }

  const systemInstruction = `You are a translation engine. Translate user content from ${sourceLanguage} to ${targetLanguage}. Return only translated text. Preserve line breaks and structure.`;

  const requestBody = {
    model,
    temperature: 0.1,
    top_p: 1.0,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 2048,
    stream: false,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: text }
    ]
  };

  let attempt = 0;
  let lastError = null;

  while (attempt < 2) {
    attempt += 1;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      }).finally(() => {
        clearTimeout(timeout);
      });

      const raw = await response.text();
      let json = null;
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch (_err) {
        json = { raw };
      }

      if (!response.ok) {
        const providerMessage = extractProviderErrorMessage(json);
        const err = new Error(providerMessage || `NVIDIA request failed with status ${response.status}`);
        err.statusCode = response.status;
        err.payload = json;
        err.retryAfterMs = getRetryAfterMs(response);
        throw err;
      }

      const translatedText = extractTranslatedText(json);
      if (!translatedText) {
        throw new Error('z.ai returned empty translation content');
      }

      return {
        translatedText,
        detectedLanguage: sourceLanguage === 'auto' ? null : sourceLanguage,
        provider: 'z.ai',
        model
      };
    } catch (error) {
      lastError = error;
      const statusCode = error?.statusCode || 0;
      const hasRetryAfter = Number.isFinite(error?.retryAfterMs) && error.retryAfterMs >= 0;
      const retriable = statusCode >= 500 || statusCode === 0 || (statusCode === 429 && hasRetryAfter);

      logger.warn('[TRANSLATE] z.ai attempt failed', {
        attempt,
        retriable,
        statusCode,
        apiUrl,
        causeCode: error?.cause?.code || null,
        error: error.message
      });

      if (!(retriable && attempt < 2)) {
        break;
      }

      const retryDelayMs = hasRetryAfter ? error.retryAfterMs : 400 * attempt;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError || new Error('Translation failed');
}

module.exports = {
  callTranslate
};
