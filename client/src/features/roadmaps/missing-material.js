const materialNouns =
  'documents?|docs?|files?|pdfs?|reports?|resumes?|cvs?|repos?|repositor(?:y|ies)|videos?|links?|' +
  'articles?|text|content|chats?|conversations?|outputs?|notes?|transcripts?|syllabus|curriculum|' +
  'pages?|posts?|threads?|answers?|responses?|messages?|screenshots?|images?|material';

const referencePatterns = Object.freeze([
  /\b(?:this|these|that|the|my)\s+(?:attached|following|above|below|given|provided|uploaded|shared|pasted)\b/i,
  /\b(?:attached|enclosed)\b/i,
  new RegExp(`\\b(?:this|these|that)\\s+(?:${materialNouns})\\b`, 'i'),
  /\b(?:convert|turn|transform|summari[sz]e|parse|analy[sz]e|break\s+down)\s+(?:this|these|that|it)\b/i,
  /\bmake\s+(?:this|these|that|it)\s+into\b/i,
  /\b(?:mentioned|listed|referenced|linked)\s+(?:in|inside)\s+(?:it|this|that|there)\b/i,
]);

const urlPattern = /https?:\/\/\S+/i;
const pastedContentLength = 400;
const inlineContentPattern = /[:\n]\s*\S[\s\S]{14,}/;

/**
 * True when a short goal refers to material ("convert this", "the attached report") that the user
 * did not paste, link or attach, so generating would plan around the instruction itself.
 */
export function referencesMissingMaterial(text, { hasAttachment = false } = {}) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value || hasAttachment || urlPattern.test(value)) return false;
  if (value.length > pastedContentLength || inlineContentPattern.test(value)) return false;
  return referencePatterns.some((pattern) => pattern.test(value));
}

export const missingMaterialMessage =
  'Your message refers to something to convert, but nothing was attached. Paste the content, ' +
  'add a link (GitHub, YouTube or Google Docs), or upload a PDF. If you meant a topic, describe ' +
  'it instead, for example "Learn React in 6 weeks". Press Create Roadmap again to continue anyway.';
