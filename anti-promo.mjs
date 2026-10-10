const DEFAULT_PROMO_WORDS = [
  'promo', 'diskon', 'discount', 'jual', 'jualan', 'beli sekarang',
  'order sekarang', 'open po', 'ready stock', 'ready stok', 'cashback',
  'reseller', 'dropship', 'investasi', 'pinjol', 'slot gacor'
];

const DEFAULT_OBSCENE_WORDS = [
  'anjing', 'bangsat', 'bajingan', 'brengsek', 'tolol', 'bodoh',
  'kontol', 'memek', 'ngentot', 'pantek', 'pecun', 'lonte'
];

const SUSPICIOUS_LINK_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /(?:wa\.me|chat\.whatsapp\.com|t\.me|telegram\.me)\//i,
  /(?:bit\.ly|tinyurl\.com|cutt\.ly|s\.id)\//i
];

export const DEFAULT_ANTI_PROMO = {
  enabled: false,
  replyText: 'Pesan promosi dihapus. Mohon jangan mengirim link atau promosi di grup ini.',
  words: DEFAULT_PROMO_WORDS,
  whitelist: [],
  obsceneEnabled: false,
  obsceneWords: DEFAULT_OBSCENE_WORDS,
  obsceneReply: 'Pesan dihapus karena mengandung kata atau tautan yang tidak diperbolehkan.'
};

export function normalizeAntiPromo(value = {}) {
  const words = Array.isArray(value.words)
    ? value.words.map(word => String(word).trim().toLowerCase()).filter(Boolean)
    : DEFAULT_PROMO_WORDS;
  const whitelist = Array.isArray(value.whitelist)
    ? value.whitelist.map(jid => String(jid).trim()).filter(jid => jid.includes('@'))
    : [];
  const obsceneWords = Array.isArray(value.obsceneWords)
    ? value.obsceneWords.map(word => String(word).trim().toLowerCase()).filter(Boolean)
    : DEFAULT_OBSCENE_WORDS;

  return {
    enabled: value.enabled === true,
    replyText: typeof value.replyText === 'string' && value.replyText.trim()
      ? value.replyText.trim().slice(0, 1000)
      : DEFAULT_ANTI_PROMO.replyText,
    words: [...new Set(words)].slice(0, 100),
    whitelist: [...new Set(whitelist)].slice(0, 500),
    obsceneEnabled: value.obsceneEnabled === true,
    obsceneWords: [...new Set(obsceneWords)].slice(0, 100),
    obsceneReply: typeof value.obsceneReply === 'string' && value.obsceneReply.trim()
      ? value.obsceneReply.trim().slice(0, 1000)
      : DEFAULT_ANTI_PROMO.obsceneReply
  };
}

export function detectPromotion(text, settings = DEFAULT_ANTI_PROMO) {
  if (typeof text !== 'string' || !text.trim()) return { detected: false, reasons: [] };

  const normalizedText = text.toLowerCase();
  const reasons = [];
  if (SUSPICIOUS_LINK_PATTERNS.some(pattern => pattern.test(text))) reasons.push('link');

  const matchedWords = normalizeAntiPromo(settings).words.filter(word => normalizedText.includes(word));
  if (matchedWords.length) reasons.push(...matchedWords.map(word => `kata:${word}`));

  return { detected: reasons.length > 0, reasons };
}

export function mentionText(jid) {
  const number = String(jid || '').split('@')[0].split(':')[0];
  return number ? `@${number}` : '@pengirim';
}

export function detectUnsafeContent(text, settings = DEFAULT_ANTI_PROMO) {
  if (typeof text !== 'string' || !text.trim()) return { detected: false, reasons: [] };
  const normalized = normalizeAntiPromo(settings);
  const reasons = [];
  if (SUSPICIOUS_LINK_PATTERNS.some(pattern => pattern.test(text))) reasons.push('link');
  const lower = text.toLowerCase();
  for (const word of normalized.obsceneWords) {
    if (new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(lower)) reasons.push(`kata:${word}`);
  }
  return { detected: normalized.obsceneEnabled && reasons.length > 0, reasons };
}