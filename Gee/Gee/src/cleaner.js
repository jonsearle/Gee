import { convert as htmlToText } from 'html-to-text';

const SIGNATURE_MARKERS = [
  '\n--\n',
  '\nThanks,',
  '\nBest,',
  '\nRegards,',
  '\nSent from my iPhone',
  '\nSent from my Android',
];

export function cleanEmailText(input, maxLen = 2200) {
  if (!input) return '';

  let text = input.replace(/\r\n/g, '\n');

  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = htmlToText(text, {
      wordwrap: false,
      selectors: [{ selector: 'a', options: { ignoreHref: true } }],
    });
  }

  text = stripQuotedReplies(text);
  text = stripSignature(text);
  text = stripDisclaimers(text);
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  if (text.length > maxLen) text = `${text.slice(0, maxLen)}...`;
  return text;
}

function stripQuotedReplies(text) {
  const markers = [
    /^On .*wrote:$/m,
    /^From: .*$/m,
    /^-----Original Message-----$/m,
    /^>+/m,
  ];

  let cutIndex = -1;
  for (const marker of markers) {
    const match = text.match(marker);
    if (match && typeof match.index === 'number') {
      cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
    }
  }

  return cutIndex >= 0 ? text.slice(0, cutIndex).trim() : text;
}

function stripSignature(text) {
  let out = text;
  for (const marker of SIGNATURE_MARKERS) {
    const idx = out.indexOf(marker);
    if (idx !== -1) {
      out = out.slice(0, idx).trim();
      break;
    }
  }
  return out;
}

function stripDisclaimers(text) {
  const patterns = [
    /This email and any attachments may contain confidential information[\s\S]*$/i,
    /The information contained in this communication is intended only for[\s\S]*$/i,
  ];

  let out = text;
  for (const re of patterns) out = out.replace(re, '').trim();
  return out;
}

export function extractReferencedDates(text) {
  if (!text) return [];

  const matches = new Set();
  const mdY = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;

  for (const m of text.matchAll(mdY)) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      matches.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }

  for (const m of text.matchAll(iso)) matches.add(`${m[1]}-${m[2]}-${m[3]}`);

  return [...matches].slice(0, 10);
}
