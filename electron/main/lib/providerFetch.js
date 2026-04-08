const {
  extractHtmlTitle,
  isJsonLikeText,
  normalizeJsonLikeText,
} = require('./text');

function buildGatewayErrorResponse(message, status = 502, statusText = 'Bad Gateway') {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    statusText,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function convertSseToJsonResponse(text, fallbackModel) {
  const payloads = normalizeJsonLikeText(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .filter(line => line && line !== '[DONE]');

  if (!payloads.length) {
    return null;
  }

  const toolCalls = new Map();
  const aggregate = {
    id: null,
    created: Math.floor(Date.now() / 1000),
    model: fallbackModel || null,
    content: '',
    reasoning: '',
    finishReason: 'stop',
    usage: undefined,
    rawError: null,
  };

  for (const payload of payloads) {
    let parsed;

    try {
      parsed = JSON.parse(payload);
    } catch (_error) {
      continue;
    }

    if (parsed?.error) {
      aggregate.rawError = parsed;
      continue;
    }

    if (Array.isArray(parsed?.choices) && parsed.choices[0]?.message) {
      return JSON.stringify(parsed);
    }

    const choice = parsed?.choices?.[0];
    const delta = choice?.delta || {};

    aggregate.id = parsed?.id || aggregate.id;
    aggregate.created = parsed?.created || aggregate.created;
    aggregate.model = parsed?.model || aggregate.model;
    aggregate.usage = parsed?.usage || aggregate.usage;

    if (typeof delta.content === 'string') {
      aggregate.content += delta.content;
    }

    if (typeof delta.reasoning_content === 'string') {
      aggregate.reasoning += delta.reasoning_content;
    }

    if (typeof delta.reasoning === 'string') {
      aggregate.reasoning += delta.reasoning;
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = Number.isFinite(part?.index) ? part.index : 0;
        const current = toolCalls.get(index) || {
          id: null,
          function: {
            name: '',
            arguments: '',
          },
          extra_content: undefined,
        };

        if (part?.id) {
          current.id = part.id;
        }

        if (part?.function?.name) {
          current.function.name += part.function.name;
        }

        if (part?.function?.arguments) {
          current.function.arguments += part.function.arguments;
        }

        if (part?.extra_content) {
          current.extra_content = part.extra_content;
        }

        toolCalls.set(index, current);
      }
    }

    if (choice?.finish_reason) {
      aggregate.finishReason = choice.finish_reason;
    }
  }

  if (aggregate.rawError) {
    return JSON.stringify(aggregate.rawError);
  }

  return JSON.stringify({
    id: aggregate.id,
    created: aggregate.created,
    model: aggregate.model,
    choices: [
      {
        message: {
          role: 'assistant',
          content: aggregate.content || null,
          reasoning_content: aggregate.reasoning || undefined,
          tool_calls: toolCalls.size ? [...toolCalls.values()] : undefined,
        },
        finish_reason: aggregate.finishReason,
      },
    ],
    usage: aggregate.usage,
  });
}

function createProviderFetch(modelId) {
  return async (input, init) => {
    const response = await fetch(input, init);
    const responseText = await response.clone().text().catch(() => null);

    if (typeof responseText !== 'string') {
      return response;
    }

    const normalizedText = normalizeJsonLikeText(responseText);
    const trimmed = normalizedText.trim();
    const contentType = response.headers.get('content-type') || '';
    const url = typeof input === 'string' ? input : input?.url || '';

    if (contentType.includes('text/html') || /^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      const title = extractHtmlTitle(normalizedText);
      const message = title
        ? `Base URL 返回了 HTML 页面（${title}），看起来不是 OpenAI 兼容 API 地址。请确认填写的是接口前缀，例如 /v1，而不是站点首页。请求地址: ${url}`
        : `Base URL 返回了 HTML 页面，看起来不是 OpenAI 兼容 API 地址。请确认填写的是接口前缀，例如 /v1，而不是站点首页。请求地址: ${url}`;

      return buildGatewayErrorResponse(message);
    }

    let replacementBody = null;

    if (contentType.includes('text/event-stream') || trimmed.startsWith('data:')) {
      replacementBody = convertSseToJsonResponse(normalizedText, modelId);
    } else if (normalizedText !== responseText) {
      replacementBody = normalizedText;
    }

    if (!replacementBody && response.ok && !isJsonLikeText(trimmed) && !contentType.includes('application/json')) {
      return buildGatewayErrorResponse(
        `接口返回的不是 JSON，而是 ${contentType || '未知内容类型'}。这通常表示 Base URL 不正确，或该中转并不兼容 OpenAI Chat Completions。请求地址: ${url}`,
      );
    }

    if (replacementBody == null) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');

    return new Response(replacementBody, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

module.exports = {
  createProviderFetch,
};
