import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AudioLines, CheckCircle2, Sparkles, Upload, X } from 'lucide-react';
import { Badge } from '../components/Badge/index.js';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Modal } from '../components/Modal/index.js';
import { Toast } from '../components/Toast/index.js';
import { useCurrentUser } from '../features/auth/hooks/use-auth.js';
import { useRecentActivity } from '../features/activity/hooks/use-activity.js';
import { useCommunityFeed } from '../features/community/hooks/use-community-feed.js';
import {
  useAnswerRoadmapClarification,
  useGenerateRoadmap,
} from '../features/roadmaps/hooks/use-roadmap-generation.js';
import { saveRoadmapPreview } from '../features/roadmaps/preview-storage.js';
import { useProfile } from '../features/users/hooks/use-profile.js';
import { useAppStore } from '../store/use-app-store.js';

const suggestedGoals = [
  'Become a Product Manager',
  'Build an AI Agent',
  'Learn React',
  'DSA Interview Prep',
  'System Design',
  'Machine Learning',
  'Roadmap for Placement',
];

export function HomePage() {
  const auth = useCurrentUser();
  const navigate = useNavigate();
  const composerDraft = useAppStore((state) => state.composerDraft);
  const setComposerDraft = useAppStore((state) => state.setComposerDraft);
  const setCurrentRoadmapId = useAppStore((state) => state.setCurrentRoadmapId);
  const [status, setStatus] = useState(null);
  const [clarification, setClarification] = useState(null);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [generationMode, setGenerationMode] = useState('quick');
  const [proficiencyOpen, setProficiencyOpen] = useState(false);
  const [proficiencySelection, setProficiencySelection] = useState(null);
  const [submittedProficiency, setSubmittedProficiency] = useState('not_sure');
  const [resumeFile, setResumeFile] = useState(null);
  const [personalizedOpen, setPersonalizedOpen] = useState(false);
  const [questionnaire, setQuestionnaire] = useState({});
  const composerRef = useRef(null);
  const fileRef = useRef(null);
  const proficiencyControlRef = useRef(null);
  const generateRoadmap = useGenerateRoadmap();
  const answerClarification = useAnswerRoadmapClarification();
  const isAuthenticated = Boolean(auth.data?.data?.user);
  const activityQuery = useRecentActivity({ enabled: isAuthenticated });
  const communityQuery = useCommunityFeed();
  const profile = useProfile({ enabled: isAuthenticated, retry: false });
  const displayName = profile.data?.data?.profile?.name ?? auth.data?.data?.user?.name;
  const firstName = displayName?.trim().split(/\s+/)[0];

  useEffect(() => {
    function focusComposer(event) {
      const target = event.target;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key === 'k')) {
        event.preventDefault();
        composerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', focusComposer);
    return () => document.removeEventListener('keydown', focusComposer);
  }, []);

  const handleGenerationResult = useCallback(
    (result) => {
      if (result.status === 'clarification') {
        setClarification(result);
        setClarificationAnswer('');
        setStatus(null);
        return;
      }
      if (!result.persisted) {
        saveRoadmapPreview({
          roadmap: result.roadmap,
          context: result.context,
          sourceUnderstanding: result.sourceUnderstanding,
          generationMetadata: result.generationMetadata,
        });
        navigate('/roadmaps/preview');
        return;
      }
      setCurrentRoadmapId(result.roadmapId);
      setComposerDraft('');
      navigate(`/roadmaps/${result.roadmapId}`);
    },
    [navigate, setComposerDraft, setCurrentRoadmapId],
  );

  const startGeneration = useCallback(
    (proficiency) => {
      const submission = {
        goal: composerDraft,
        experienceLevel: proficiency === 'not_sure' ? null : proficiency,
        mode: generationMode,
        questionnaire,
        resumeFile,
        persist: isAuthenticated,
      };
      setStatus({ tone: 'default', message: 'Starting your roadmap…' });
      setClarification(null);
      generateRoadmap.mutate(
        {
          ...submission,
          onStage: (message) => setStatus({ tone: 'default', message }),
        },
        {
          onSuccess: handleGenerationResult,
          onError: (error) =>
            setStatus({ tone: 'error', message: generationErrorMessage(error), retry: true }),
        },
      );
    },
    [
      composerDraft,
      generateRoadmap,
      generationMode,
      handleGenerationResult,
      isAuthenticated,
      questionnaire,
      resumeFile,
    ],
  );

  const continueWithProficiency = useCallback(
    (selection = proficiencySelection ?? 'not_sure') => {
      setProficiencyOpen(false);
      setSubmittedProficiency(selection);
      startGeneration(selection);
    },
    [proficiencySelection, startGeneration],
  );

  useEffect(() => {
    if (!proficiencyOpen) return undefined;

    function dismissOnOutsideClick(event) {
      if (!proficiencyControlRef.current?.contains(event.target)) continueWithProficiency();
    }

    function dismissOnEscape(event) {
      if (event.key === 'Escape') continueWithProficiency();
    }

    document.addEventListener('pointerdown', dismissOnOutsideClick);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsideClick);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [continueWithProficiency, proficiencyOpen]);

  function submitQuickMode(event) {
    event.preventDefault();
    setProficiencySelection(null);
    setProficiencyOpen(true);
  }

  function submitClarification(event) {
    event.preventDefault();
    const question = clarification.decision.selectedQuestion;
    let answer = clarificationAnswer;
    if (question.type === 'number') answer = Number(answer);
    if (question.type === 'boolean') answer = answer === 'true';
    answerClarification.mutate(
      {
        context: clarification.context,
        sourceUnderstanding: clarification.sourceUnderstanding,
        decision: clarification.decision,
        answer,
        persist: isAuthenticated,
        onStage: (message) => setStatus({ tone: 'default', message }),
      },
      {
        onSuccess: handleGenerationResult,
        onError: (error) =>
          setStatus({ tone: 'error', message: generationErrorMessage(error), retry: false }),
      },
    );
  }

  return (
    <section className="home-page">
      <div className="home-frame">
        <div className="home-grid">
          <div className="home-main">
            <div className="home-hero">
              <div className="home-hero-header">
                <div className="home-hero-heading">
                  <h1>
                    {firstName ? `${firstName}, create your next roadmap.` : 'Create your roadmap'}
                  </h1>
                  <p className="home-subtitle">
                    Transform any goal, document, repository, project, video, or AI-generated output
                    into an interactive roadmap you can edit, track, and adapt.
                  </p>
                </div>
                {isAuthenticated ? <Badge tone="success">Personal workspace</Badge> : null}
              </div>
              {status ? (
                status.tone === 'error' ? (
                  <div className="generation-error">
                    <Toast tone="error">{status.message}</Toast>
                    {status.retry ? (
                      <Button type="button" onClick={() => startGeneration(submittedProficiency)}>
                        Try again
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <GenerationProgress message={status.message} />
                )
              ) : null}
              {clarification ? (
                <Card className="clarification-card">
                  <form onSubmit={submitClarification}>
                    <div>
                      <Badge>One quick question</Badge>
                      <h2>{clarification.decision.selectedQuestion.question}</h2>
                      <p>{clarification.decision.selectedQuestion.reason}</p>
                    </div>
                    <ClarificationInput
                      question={clarification.decision.selectedQuestion}
                      value={clarificationAnswer}
                      onChange={setClarificationAnswer}
                    />
                    <div className="clarification-actions">
                      <Button
                        type="button"
                        onClick={() => setClarification(null)}
                        disabled={answerClarification.isPending}
                      >
                        Edit goal
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={answerClarification.isPending || clarificationAnswer === ''}
                      >
                        {answerClarification.isPending ? 'Generating…' : 'Continue'}
                      </Button>
                    </div>
                  </form>
                </Card>
              ) : null}
              <Card className="home-composer" id="composer">
                <form className="home-composer-body" onSubmit={submitQuickMode}>
                  <textarea
                    ref={composerRef}
                    className="home-composer-input"
                    aria-label="Describe your learning goal"
                    placeholder="Describe a career goal, certification, interview plan, project, or add a resource…"
                    rows="2"
                    required
                    value={composerDraft}
                    onChange={(event) => setComposerDraft(event.target.value)}
                  />
                  <div className="home-composer-actions">
                    <div className="composer-controls">
                      <Button
                        type="button"
                        aria-label="Voice input coming soon"
                        disabled
                        title="Voice input is coming soon"
                      >
                        <AudioLines size={16} />
                      </Button>
                      <input
                        ref={fileRef}
                        className="visually-hidden"
                        type="file"
                        accept="application/pdf,.pdf"
                        aria-label="Upload PDF"
                        onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                      />
                      <Button
                        type="button"
                        aria-label="Upload PDF"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload size={16} />
                      </Button>
                    </div>
                    <div className="composer-controls">
                      <Button
                        type="button"
                        variant={generationMode === 'personalized' ? 'selected' : 'default'}
                        onClick={() => setPersonalizedOpen(true)}
                      >
                        {generationMode === 'personalized' ? 'Personalized' : 'Quick mode'}
                      </Button>
                      <div className="proficiency-control" ref={proficiencyControlRef}>
                        <Button
                          type="submit"
                          variant="primary"
                          aria-label="Generate roadmap"
                          aria-expanded={proficiencyOpen}
                          aria-controls={proficiencyOpen ? 'proficiency-prompt' : undefined}
                          disabled={generateRoadmap.isPending || answerClarification.isPending}
                        >
                          <Sparkles size={14} />
                          {generateRoadmap.isPending ? 'Thinking…' : 'Create Roadmap'}
                        </Button>
                        {proficiencyOpen ? (
                          <ProficiencyPopover
                            value={proficiencySelection}
                            onChange={setProficiencySelection}
                            onContinue={() => continueWithProficiency()}
                            onDismiss={() => continueWithProficiency()}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {resumeFile ? (
                    <div className="composer-attachment">
                      <Upload size={14} />
                      <span>{resumeFile.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setResumeFile(null);
                          if (fileRef.current) fileRef.current.value = '';
                        }}
                        aria-label="Remove resume"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </form>
              </Card>
              <p className="composer-source-helper">
                Paste a goal, upload a PDF, connect a GitHub repository, share a YouTube link, or
                drop AI-generated content—we’ll turn it into a personalized roadmap.
              </p>
              <div className="composer-suggestions" aria-label="Suggested roadmap goals">
                {suggestedGoals.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => {
                      setComposerDraft(goal);
                      composerRef.current?.focus();
                    }}
                  >
                    {goal}
                  </button>
                ))}
              </div>
              <p className="composer-privacy-note">
                {isAuthenticated
                  ? 'Your roadmap will be saved automatically.'
                  : 'No account required. Sign in only when you want to save your roadmap.'}
                <span> Press / to focus.</span>
              </p>
            </div>

            <RecentActivity query={activityQuery} isAuthenticated={isAuthenticated} />
          </div>

          <aside className="home-sidebar">
            <Card className="community-feed-card">
              <div className="community-feed-heading">
                <h2>
                  <Activity size={16} /> Community Feed
                </h2>
              </div>
              <div className="community-roadmap-list">
                <CommunityFeed query={communityQuery} />
              </div>
            </Card>
          </aside>
        </div>
      </div>
      <PersonalizedRoadmapModal
        open={personalizedOpen}
        initial={questionnaire}
        onClose={() => setPersonalizedOpen(false)}
        onApply={(values) => {
          setQuestionnaire(values);
          setGenerationMode('personalized');
          setPersonalizedOpen(false);
        }}
        onQuick={() => {
          setQuestionnaire({});
          setGenerationMode('quick');
          setPersonalizedOpen(false);
        }}
      />
    </section>
  );
}

const proficiencyOptions = Object.freeze([
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'not_sure', label: 'Not sure' },
]);

function ProficiencyPopover({ value, onChange, onContinue, onDismiss }) {
  return (
    <div
      className="proficiency-popover"
      id="proficiency-prompt"
      role="dialog"
      aria-modal="false"
      aria-labelledby="proficiency-title"
    >
      <button
        className="proficiency-dismiss"
        type="button"
        aria-label="Dismiss proficiency prompt"
        onClick={onDismiss}
      >
        <X size={15} />
      </button>
      <div className="proficiency-copy">
        <strong id="proficiency-title">How familiar are you with this topic?</strong>
        <p>This helps us recommend resources that better match your current level.</p>
      </div>
      <div className="proficiency-options" role="radiogroup" aria-label="Topic proficiency">
        {proficiencyOptions.map((option) => (
          <label key={option.value} data-selected={value === option.value}>
            <input
              type="radio"
              name="topic-proficiency"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <Button type="button" variant="primary" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}

function relativeTime(value) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function CommunityFeed({ query }) {
  if (query.isPending) return <p className="feed-state">Loading public roadmaps…</p>;
  if (query.isError) {
    return (
      <div className="feed-state feed-state--error">
        <p>Community roadmaps couldn’t be loaded.</p>
        <Button type="button" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const roadmaps = query.data?.data?.roadmaps ?? [];
  if (roadmaps.length === 0) {
    return (
      <p className="feed-state">
        No public roadmaps yet. Publish your roadmap to inspire the community.
      </p>
    );
  }
  return roadmaps.map((roadmap) => (
    <article className="community-roadmap" key={roadmap.roadmapId}>
      <small>{roadmap.creatorName ?? 'Tracer AI learner'}</small>
      <h3>{roadmap.title}</h3>
      <p>{roadmap.summary}</p>
      <div className="community-roadmap-meta">
        <span>{roadmap.difficulty}</span>
        <span>{roadmap.estimatedWeeks} weeks</span>
        <time dateTime={roadmap.publishedAt}>{relativeTime(roadmap.publishedAt)}</time>
      </div>
    </article>
  ));
}

function RecentActivity({ query, isAuthenticated }) {
  const activities = query.data?.data?.activities ?? [];
  return (
    <section className="recent-activity" aria-labelledby="recent-activity-heading">
      <div className="section-header">
        <div>
          <h2 id="recent-activity-heading">Recent Activity</h2>
          <p className="section-description">Your latest learning milestones.</p>
        </div>
      </div>
      <div className="activity-timeline">
        {isAuthenticated && query.isPending ? (
          <p className="feed-state">Loading activity…</p>
        ) : null}
        {isAuthenticated && query.isError ? (
          <div className="feed-state feed-state--error">
            <p>Your activity couldn’t be loaded.</p>
            <Button type="button" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}
        {!isAuthenticated || (!query.isPending && !query.isError && activities.length === 0) ? (
          <p className="feed-state">
            Your learning activity will appear here as you make progress.
          </p>
        ) : null}
        {activities.map((activity) => (
          <article className="activity-entry" key={activity.activityId}>
            <div className="activity-node" data-status="completed" aria-hidden="true">
              <CheckCircle2 size={12} />
            </div>
            <div className="activity-card">
              <div>
                <span>{activity.activityType.toLowerCase().replaceAll('_', ' ')}</span>
                <time dateTime={activity.timestamp}>{relativeTime(activity.timestamp)}</time>
              </div>
              <strong>{activity.shortDescription}</strong>
              <p>{activity.roadmapTitle}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function generationErrorMessage(error) {
  if (error.code === 'AI_RATE_LIMITED') {
    return 'You’ve created several roadmaps recently. Please wait a little before trying again.';
  }
  if (error.code === 'AI_NOT_CONFIGURED') {
    return 'Roadmap generation is temporarily unavailable because the AI connection is not configured.';
  }
  if (error.code === 'AI_PROVIDER_ERROR') {
    return 'The AI service couldn’t finish this roadmap. Your goal is still here—please try again.';
  }
  return error.message || 'We couldn’t finish your roadmap. Your input is safe; please try again.';
}

function GenerationProgress({ message }) {
  return (
    <div className="generation-progress" role="status" aria-live="polite">
      <span className="generation-orb" aria-hidden="true" />
      <div>
        <strong>{message}</strong>
        <small>Building the complete roadmap in one pass</small>
      </div>
    </div>
  );
}

function PersonalizedRoadmapModal({ open, initial, onClose, onApply, onQuick }) {
  return (
    <Modal open={open} title="Personalize your roadmap" onClose={onClose}>
      <form
        className="personalized-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget));
          onApply({
            weeklyHours: Number(data.weeklyHours),
            preferredLanguage: data.preferredLanguage,
            preferredResourceLanguage: data.preferredResourceLanguage,
            learningStyle: data.learningStyle,
            targetDeadline: data.targetDeadline || null,
            preferredRoadmapStyle: data.preferredRoadmapStyle,
          });
        }}
      >
        <div className="personalized-grid">
          <label>
            Weekly study hours
            <input
              name="weeklyHours"
              type="number"
              min="1"
              max="168"
              defaultValue={initial.weeklyHours ?? 8}
              required
            />
          </label>
          <label>
            Preferred language
            <input name="preferredLanguage" defaultValue={initial.preferredLanguage ?? 'English'} />
          </label>
          <label>
            Resource language
            <input
              name="preferredResourceLanguage"
              defaultValue={initial.preferredResourceLanguage ?? 'English'}
            />
          </label>
          <label>
            Learning style
            <select name="learningStyle" defaultValue={initial.learningStyle ?? 'project-based'}>
              <option value="project-based">Project based</option>
              <option value="guided">Guided lessons</option>
              <option value="reading-and-practice">Reading and practice</option>
            </select>
          </label>
          <label>
            Target deadline
            <input name="targetDeadline" type="date" defaultValue={initial.targetDeadline ?? ''} />
          </label>
          <label>
            Roadmap style
            <select
              name="preferredRoadmapStyle"
              defaultValue={initial.preferredRoadmapStyle ?? 'balanced'}
            >
              <option value="balanced">Balanced</option>
              <option value="intensive">Intensive</option>
              <option value="project-first">Project first</option>
            </select>
          </label>
        </div>
        <div className="clarification-actions">
          <Button type="button" onClick={onQuick}>
            Use Quick Mode
          </Button>
          <Button type="submit" variant="primary">
            Apply preferences
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ClarificationInput({ question, value, onChange }) {
  if (['multiple_choice', 'dropdown', 'boolean'].includes(question.type)) {
    return (
      <select
        className="clarification-input"
        aria-label="Clarification answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        <option value="">Select an answer</option>
        {question.options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="clarification-input"
      aria-label="Clarification answer"
      type={question.type === 'free_text' ? 'text' : question.type}
      min={question.type === 'number' ? '1' : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required
    />
  );
}
