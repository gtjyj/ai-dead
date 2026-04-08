function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function compactText(value, maxLength = 240) {
  const text = trimText(value).replace(/\s+/g, ' ');
  if (!text) {
    return '';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeBaseURL(value) {
  return trimText(value).replace(/\/+$/, '');
}

function normalizeJsonLikeText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/^\uFEFF/, '');
}

function extractHtmlTitle(text) {
  if (typeof text !== 'string') {
    return '';
  }

  const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return compactText(match?.[1] || '', 80);
}

function isJsonLikeText(text) {
  if (typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

module.exports = {
  compactText,
  extractHtmlTitle,
  isJsonLikeText,
  normalizeBaseURL,
  normalizeJsonLikeText,
  trimText,
};
