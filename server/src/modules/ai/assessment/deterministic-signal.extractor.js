import { createHash } from 'node:crypto';
import { normalizeInputText } from '../input/text-normalizer.js';

const sourceLimits = Object.freeze({
  naturalLanguage: 20_000,
  projectDescription: 20_000,
  resumeText: 200_000,
});

const technologyPatterns = Object.freeze([
  ['JavaScript', /\bjavascript\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['React', /\breact(?:\.js|js)?\b/i],
  ['Angular', /\bangular\b/i],
  ['Vue', /\bvue(?:\.js|js)?\b/i],
  ['Node.js', /\bnode(?:\.js|js)\b/i],
  ['Python', /\bpython\b/i],
  ['Java', /\bjava\b/i],
  ['C#', /\bc#(?=\s|$|[,.;)])/i],
  ['C++', /\bc\+\+(?=\s|$|[,.;)])/i],
  ['Go', /\bgolang\b|\bgo programming\b/i],
  ['Rust', /\brust\b/i],
  ['SQL', /\bsql\b/i],
  ['MongoDB', /\bmongodb\b/i],
  ['PostgreSQL', /\bpostgres(?:ql)?\b/i],
  ['MySQL', /\bmysql\b/i],
  ['Docker', /\bdocker\b/i],
  ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['AWS', /\baws\b|\bamazon web services\b/i],
  ['Azure', /\bazure\b/i],
  ['Google Cloud', /\bgcp\b|\bgoogle cloud\b/i],
  ['Git', /\bgit\b/i],
  ['HTML', /\bhtml\b/i],
  ['CSS', /\bcss\b/i],
  ['Figma', /\bfigma\b/i],
  ['Tableau', /\btableau\b/i],
  ['Power BI', /\bpower\s*bi\b/i],
  ['TensorFlow', /\btensorflow\b/i],
  ['PyTorch', /\bpytorch\b/i],
]);

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneCandidatePattern = /(?:\+?\d[\d ().–-]{7,}\d)/g;
const yearPattern = /\b(?:19|20)\d{2}\b/g;
const datePattern =
  /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}|(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|present|current))\b/gi;
const experiencePattern = /\b\d{1,2}\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b/gi;
const educationPattern =
  /\b(?:bachelor(?:'s)?|master(?:'s)?|ph\.?d\.?|degree|university|college|certification)\b/gi;
const educationLinePattern =
  /\b(?:b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|b\.?sc|m\.?sc|bachelor(?:'s)?|master(?:'s)?|ph\.?d\.?|degree|university|college|certification|diploma)\b/i;
const jobTitlePattern =
  /\b(?:(?:senior|junior|lead|principal|staff|associate)\s+)?(?:software|frontend|front-end|backend|back-end|full-stack|full stack|web|mobile|data|machine learning|ml|cloud|devops|qa|test|security|product|project|business|systems?)\s+(?:engineer|developer|analyst|scientist|architect|manager|designer|consultant|intern)|software engineer|product manager|project manager|data scientist|data analyst|business analyst|research assistant|teaching assistant\b/gi;
const experienceLinePattern =
  /\b(?:experience|employment|work history|internship|intern|engineer|developer|analyst|scientist|architect|manager|designer|consultant|assistant|worked|led|built|developed|implemented)\b/i;

function redactPhoneCandidates(value) {
  return value.replace(phoneCandidatePattern, (candidate) => {
    if (/^\s*(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\s*$/.test(candidate)) {
      return candidate;
    }
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? '[PHONE_REDACTED]' : candidate;
  });
}

function redactContactDetails(value) {
  return redactPhoneCandidates(value.replace(emailPattern, '[EMAIL_REDACTED]'));
}

function phoneCandidates(value) {
  return (value.match(phoneCandidatePattern) ?? []).filter((candidate) => {
    if (/^\s*(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\s*$/.test(candidate)) return false;
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  });
}

function matchingLines(value, pattern) {
  return Object.freeze(
    [
      ...new Set(
        value
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && pattern.test(line)),
      ),
    ]
      .slice(0, 50)
      .map((line) => line.slice(0, 500)),
  );
}

function uniqueMatches(text, pattern) {
  return Object.freeze([...new Set(text.match(pattern) ?? [])]);
}

export function prepareAssessmentInputs(inputs) {
  const sanitizedInputs = {};
  const signalSources = [];

  for (const [source, maximumCharacters] of Object.entries(sourceLimits)) {
    if (inputs[source] != null) {
      const normalized = normalizeInputText(inputs[source], { maximumCharacters }).text;
      signalSources.push(normalized);
      sanitizedInputs[source] = redactContactDetails(normalized);
    }
  }

  const combinedText = signalSources.join('\n\n');
  const sanitizedText = Object.values(sanitizedInputs).join('\n\n');
  const technologies = technologyPatterns
    .filter(([, pattern]) => pattern.test(combinedText))
    .map(([name]) => name);

  const deterministicSignals = Object.freeze({
    contactDetailsRedacted:
      sanitizedText.includes('[EMAIL_REDACTED]') || sanitizedText.includes('[PHONE_REDACTED]'),
    contactSignals: Object.freeze({
      emailCount: (combinedText.match(emailPattern) ?? []).length,
      phoneCount: phoneCandidates(combinedText).length,
    }),
    dates: uniqueMatches(combinedText, datePattern),
    yearsMentioned: uniqueMatches(combinedText, yearPattern),
    experienceStatements: uniqueMatches(combinedText, experiencePattern),
    yearsOfExperience: Object.freeze(
      uniqueMatches(combinedText, experiencePattern).map((statement) => ({
        years: Number.parseInt(statement, 10),
        statement,
      })),
    ),
    experienceEntries: matchingLines(combinedText, experienceLinePattern),
    educationTerms: uniqueMatches(combinedText, educationPattern),
    educationEntries: matchingLines(combinedText, educationLinePattern),
    jobTitles: uniqueMatches(combinedText, jobTitlePattern),
    technologies: Object.freeze(technologies),
  });

  const canonicalInput = JSON.stringify({ inputs: sanitizedInputs, deterministicSignals });

  return Object.freeze({
    inputs: Object.freeze(sanitizedInputs),
    deterministicSignals,
    inputHash: createHash('sha256').update(canonicalInput).digest('hex'),
  });
}
