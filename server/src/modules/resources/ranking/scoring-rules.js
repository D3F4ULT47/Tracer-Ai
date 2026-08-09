import { number, strings, text, tokens } from './ranking-context.js';

const difficultyOrder = ['beginner', 'intermediate', 'advanced', 'expert'];
const relevanceStopWords = new Set([
  'and',
  'build',
  'complete',
  'create',
  'for',
  'from',
  'into',
  'learn',
  'roadmap',
  'that',
  'the',
  'this',
  'through',
  'understand',
  'using',
  'with',
  'your',
]);

function clamp(value) {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function result(score, source) {
  return { score: clamp(score), source };
}

function dateFromResource(resource) {
  const metadata = resource.providerMetadata ?? {};
  const value = metadata.publishedAt ?? metadata.pushedAt ?? metadata.updatedAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function logarithmicScore(value, ceilingPower) {
  if (!value || value <= 0) return 20;
  return clamp((Math.log10(value + 1) / ceilingPower) * 100);
}

function levelDistance(left, right) {
  const leftIndex = difficultyOrder.indexOf(left);
  const rightIndex = difficultyOrder.indexOf(right);
  if (leftIndex < 0 || rightIndex < 0) return null;
  return Math.abs(leftIndex - rightIndex);
}

function scoreDistance(distance, readinessBoost = false) {
  if (distance === null) return 60;
  if (distance === 0) return 100;
  if (distance === 1) return readinessBoost ? 85 : 75;
  if (distance === 2) return 40;
  return 15;
}

function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function relevanceTokens(...values) {
  return new Set([...tokens(...values)].filter((token) => !relevanceStopWords.has(token)));
}

export function createDefaultScoringRules() {
  return [
    {
      name: 'authorityScore',
      source: 'resource',
      score({ resource }) {
        if (resource.providerMetadata?.official) return result(100, 'resource');
        if (resource.providerMetadata?.curated) return result(95, 'resource');
        if (resource.type === 'documentation') return result(85, 'resource');
        if (resource.provider === 'github') return result(72, 'resource');
        if (resource.provider === 'youtube') return result(65, 'resource');
        return result(55, 'system_default');
      },
    },
    {
      name: 'freshnessScore',
      source: 'resource',
      score({ resource, now }) {
        const sourceDate = dateFromResource(resource);
        if (!sourceDate) {
          return result(resource.providerMetadata?.official ? 85 : 50, 'system_default');
        }
        const ageDays = Math.max(0, (now.getTime() - sourceDate.getTime()) / 86_400_000);
        if (ageDays <= 180) return result(100, 'resource');
        if (ageDays <= 365) return result(85, 'resource');
        if (ageDays <= 730) return result(65, 'resource');
        if (ageDays <= 1460) return result(45, 'resource');
        return result(25, 'resource');
      },
    },
    {
      name: 'popularityScore',
      source: 'resource',
      score({ resource }) {
        const popularity = resource.popularity ?? {};
        if (resource.type === 'repository') {
          return result(
            logarithmicScore(popularity.stars, 5) * 0.75 +
              logarithmicScore(popularity.forks, 4) * 0.25,
            'resource',
          );
        }
        if (['video', 'playlist'].includes(resource.type)) {
          return result(
            logarithmicScore(popularity.views, 7) * 0.8 +
              logarithmicScore(popularity.likes, 6) * 0.2,
            'resource',
          );
        }
        if (resource.providerMetadata?.official) return result(75, 'system_default');
        if (popularity.rating != null) return result(popularity.rating * 20, 'resource');
        return result(45, 'system_default');
      },
    },
    {
      name: 'difficultyMatch',
      source: 'task',
      score({ resource, task, learningContext }) {
        if (!resource.difficulty) return result(60, 'system_default');
        const preferred = text(learningContext.difficultyPreference);
        const current = text(learningContext.currentProficiency);
        const readinessBoost = (task.progressContext?.completedPhaseTitles?.length ?? 0) >= 2;
        const taskScore = scoreDistance(
          levelDistance(resource.difficulty, task.difficulty),
          readinessBoost,
        );
        const learnerTarget = preferred || current;
        const learnerScore = learnerTarget
          ? scoreDistance(levelDistance(resource.difficulty, learnerTarget), readinessBoost)
          : taskScore;
        return result(taskScore * 0.7 + learnerScore * 0.3, 'learning_context');
      },
    },
    {
      name: 'learningStyleMatch',
      source: 'learning_context',
      score({ resource, learningContext }) {
        const style = normalized(text(learningContext.learningStyle));
        if (!style) return result(65, 'system_default');
        const matches = {
          visual: ['video', 'playlist'],
          video: ['video', 'playlist'],
          'project-based': ['repository', 'project'],
          practical: ['repository', 'project'],
          guided: ['course', 'playlist', 'documentation'],
          reading: ['documentation', 'reference', 'article'],
          'reading-and-practice': ['documentation', 'reference', 'repository', 'project'],
        };
        const preferredTypes = matches[style] ?? [];
        return result(preferredTypes.includes(resource.type) ? 100 : 45, 'learning_context');
      },
    },
    {
      name: 'preferredPlatformMatch',
      source: 'learning_context',
      score({ resource, learningContext }) {
        const preferences = strings(learningContext.preferredPlatforms).map(normalized);
        if (preferences.length === 0) return result(65, 'system_default');
        const aliases = new Set([
          normalized(resource.provider),
          normalized(resource.type),
          normalized(resource.author),
          resource.provider === 'official_docs' ? 'official documentation' : '',
          resource.provider === 'youtube' ? 'youtube' : '',
          resource.provider === 'github' ? 'github' : '',
        ]);
        return result(
          preferences.some((preference) => aliases.has(preference)) ? 100 : 35,
          'learning_context',
        );
      },
    },
    {
      name: 'languageMatch',
      source: 'learning_context',
      score({ resource, learningContext }) {
        const preferred = normalized(
          text(learningContext.preferredResourceLanguage) ||
            text(learningContext.preferredLanguage),
        );
        if (!preferred) return result(70, 'system_default');
        if (!resource.language) return result(60, 'system_default');
        const language = normalized(resource.language);
        return result(
          language === preferred || language.startsWith(preferred) || preferred.startsWith(language)
            ? 100
            : 15,
          'learning_context',
        );
      },
    },
    {
      name: 'estimatedTimeMatch',
      source: 'learning_context',
      score({ resource, task, learningContext }) {
        if (resource.estimatedDurationMinutes == null) return result(55, 'system_default');
        const weeklyMinutes = (number(learningContext.weeklyHours) ?? 0) * 60;
        const available = task.estimatedMinutes ?? weeklyMinutes;
        if (!available) return result(65, 'system_default');
        const ratio = resource.estimatedDurationMinutes / available;
        if (ratio <= 1) return result(100, 'learning_context');
        if (ratio <= 1.5) return result(75, 'learning_context');
        if (ratio <= 2) return result(45, 'learning_context');
        return result(20, 'learning_context');
      },
    },
    {
      name: 'completenessScore',
      source: 'resource',
      score({ resource }) {
        const typeBase =
          {
            course: 90,
            documentation: 88,
            playlist: 85,
            reference: 85,
            project: 80,
            repository: 75,
            video: 70,
            article: 65,
          }[resource.type] ?? 60;
        const metadataBonus =
          (resource.description ? 4 : 0) +
          (resource.author ? 3 : 0) +
          (resource.tags.length >= 3 ? 3 : 0);
        return result(typeBase + metadataBonus, 'resource');
      },
    },
    {
      name: 'providerConfidenceScore',
      source: 'resource',
      score({ resource }) {
        if (resource.providerMetadata?.official && resource.providerMetadata?.curated) {
          return result(100, 'resource');
        }
        if (resource.provider === 'github') return result(88, 'resource');
        if (resource.provider === 'youtube') return result(82, 'resource');
        return result(60, 'system_default');
      },
    },
    {
      name: 'goalMatch',
      source: 'learning_context',
      score({ resource, task, learningContext }) {
        const resourceTokens = relevanceTokens(resource.title, resource.description, resource.tags);
        const titleTokens = relevanceTokens(task.title);
        const contextTokens = relevanceTokens(
          task.description,
          text(learningContext.primaryGoal),
          text(learningContext.careerGoal),
          text(learningContext.careerDirection),
        );
        if (titleTokens.size === 0 && contextTokens.size === 0) {
          return result(60, 'system_default');
        }
        const titleMatches = [...titleTokens].filter((token) => resourceTokens.has(token)).length;
        const contextMatches = [...contextTokens].filter((token) =>
          resourceTokens.has(token),
        ).length;
        const titleRatio = titleTokens.size > 0 ? titleMatches / titleTokens.size : 0;
        const contextRatio = contextTokens.size > 0 ? contextMatches / contextTokens.size : 0;
        const completedTokens = relevanceTokens(task.progressContext?.completedPhaseTitles ?? []);
        const redundant = [...completedTokens].filter((token) => resourceTokens.has(token)).length;
        return result(
          25 + titleRatio * 55 + contextRatio * 20 - Math.min(15, redundant * 3),
          'learning_context',
        );
      },
    },
    {
      name: 'budgetMatch',
      source: 'learning_context',
      score({ resource, learningContext }) {
        const constraints = strings(learningContext.constraints).map(normalized);
        const freeOnly = constraints.some((constraint) => constraint.includes('free resource'));
        const budget = number(learningContext.budget);
        if (resource.accessType === 'free') return result(100, 'resource');
        if (freeOnly) return result(resource.accessType === 'mixed' ? 40 : 0, 'learning_context');
        if (resource.accessType === 'paid') {
          if (budget === 0) return result(10, 'learning_context');
          return result(budget == null ? 55 : 85, 'learning_context');
        }
        return result(60, 'system_default');
      },
    },
  ];
}
