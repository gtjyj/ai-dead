const { compactText, extractHtmlTitle } = require('./text');
const { DEFAULT_REQUEST_TIMEOUT_SECONDS } = require('../constants');

function getNestedError(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  if (error.lastError) {
    return error.lastError;
  }

  if (Array.isArray(error.errors) && error.errors.length) {
    return error.errors[error.errors.length - 1];
  }

  if (error.cause) {
    return error.cause;
  }

  return null;
}

function parseErrorMessage(error, timeoutMs = DEFAULT_REQUEST_TIMEOUT_SECONDS * 1000) {
  if (!error) {
    return '未知错误';
  }

  const nestedError = getNestedError(error);
  if (nestedError && nestedError !== error) {
    return parseErrorMessage(nestedError, timeoutMs);
  }

  if (error.name === 'AbortError') {
    return `请求超时（${Math.round(timeoutMs / 1000)} 秒）`;
  }

  if (typeof error.responseBody === 'string') {
    try {
      const parsed = JSON.parse(error.responseBody);
      const providerMessage = compactText(parsed?.error?.message || '');
      if (providerMessage) {
        return providerMessage;
      }
    } catch (_parseError) {
      const htmlTitle = extractHtmlTitle(error.responseBody);
      if (htmlTitle) {
        return `返回了 HTML 页面（${htmlTitle}），而不是 OpenAI 兼容 JSON 响应。`;
      }
    }
  }

  if (error.message === 'Invalid JSON response') {
    const statusText = error.statusCode ? `HTTP ${error.statusCode}` : '响应解析失败';
    const responseBody = compactText(error.responseBody || error.cause?.message || '');
    return responseBody ? `${statusText}: ${responseBody}` : statusText;
  }

  return error.message || '请求失败';
}

module.exports = {
  parseErrorMessage,
};
