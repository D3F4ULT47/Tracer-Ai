import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  Check,
  Circle,
  Database,
  Layers3,
  Network,
  Paperclip,
  RotateCcw,
  ScanSearch,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '../../../components/Button/index.js';

const generationStages = Object.freeze([
  {
    id: 'input_analysis',
    percentage: 8,
    title: 'Analyze your inputs',
    description: 'Detecting your goal and the kind of roadmap you need.',
    icon: ScanSearch,
  },
  {
    id: 'source_understanding',
    percentage: 18,
    title: 'Understand your sources',
    description: 'Reading your prompt and any material you attached.',
    icon: Layers3,
  },
  {
    id: 'learner_assessment',
    percentage: 28,
    title: 'Understand your current level',
    description: 'Grounding proficiency in the evidence you provided.',
    icon: BrainCircuit,
  },
  {
    id: 'learning_context',
    percentage: 38,
    title: 'Build learning context',
    description: 'Combining your goals, preferences, time, and constraints.',
    icon: Network,
  },
  {
    id: 'roadmap_planning',
    percentage: 48,
    title: 'Plan roadmap structure',
    description: 'Building the complete sequence and prerequisite graph.',
    icon: Network,
  },
  {
    id: 'roadmap_validation',
    percentage: 58,
    title: 'Validate the roadmap',
    description: 'Checking workload, dependencies, and learning progression.',
    icon: ShieldCheck,
  },
  {
    id: 'resource_discovery',
    percentage: 67,
    title: 'Discover learning resources',
    description: 'Finding useful material for every roadmap task.',
    icon: Search,
  },
  {
    id: 'resource_ranking',
    percentage: 77,
    title: 'Rank the best resources',
    description: 'Matching quality and difficulty to your preferences.',
    icon: SlidersHorizontal,
  },
  {
    id: 'resource_attachment',
    percentage: 86,
    title: 'Attach resources',
    description: 'Connecting the strongest options to the right tasks.',
    icon: Paperclip,
  },
  {
    id: 'persistence',
    percentage: 94,
    title: 'Prepare your roadmap',
    description: 'Creating a reliable first version of your roadmap.',
    icon: Database,
  },
  {
    id: 'workspace_ready',
    percentage: 100,
    title: 'Finalizing workspace',
    description: 'Getting your interactive roadmap ready to explore.',
    icon: Layers3,
  },
]);

function useAnimatedProgress(target) {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    const from = valueRef.current;
    const startedAt = performance.now();
    const duration = Math.max(280, Math.min(800, (target - from) * 24));
    let frame;

    function animate(now) {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - elapsed) ** 3;
      const next = Math.max(from, from + (target - from) * eased);
      valueRef.current = next;
      setValue(next);
      if (elapsed < 1) frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return Math.round(value);
}

function StageMarker({ state, Icon }) {
  if (state === 'complete') return <Check size={14} strokeWidth={3} />;
  if (state === 'failed') return <X size={14} strokeWidth={3} />;
  if (state === 'active') return <span className="generation-stage-pulse" />;
  return <Icon size={14} />;
}

export function GenerationExperience({ progress, error, onRetry, onBack }) {
  const currentIndex = Math.max(
    0,
    generationStages.findIndex((stage) => stage.id === progress.stageId),
  );
  const target = error ? progress.percentage : Math.max(1, progress.percentage);
  const animatedProgress = useAnimatedProgress(target);
  const activeStageRef = useRef(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    activeStageRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [currentIndex]);

  return (
    <div
      className="generation-experience"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-experience-title"
    >
      <div className="generation-ambient" aria-hidden="true" />
      <section className="generation-card">
        <header className="generation-card-header">
          <span className="generation-brand-mark" aria-hidden="true">
            <BrainCircuit size={20} />
          </span>
          <div>
            <h2 id="generation-experience-title">
              {progress.stageId === 'workspace_ready'
                ? 'Your roadmap is ready'
                : 'Generating your personalized roadmap'}
            </h2>
            <p>Analyzing your inputs and building the most effective learning path.</p>
          </div>
        </header>

        <div className="generation-meter" aria-label={`${animatedProgress}% complete`}>
          <div className="generation-meter-labels">
            <span>{error ? 'Generation paused' : 'Building roadmap'}</span>
            <strong>{animatedProgress}%</strong>
          </div>
          <div className="generation-meter-track">
            <span
              className={error ? 'generation-meter-fill is-error' : 'generation-meter-fill'}
              style={{ width: `${animatedProgress}%` }}
            />
          </div>
        </div>

        <ol className="generation-timeline" aria-label="Roadmap generation progress">
          {generationStages.map((stage) => {
            const index = generationStages.findIndex((candidate) => candidate.id === stage.id);
            let state = 'upcoming';
            if (index < currentIndex || progress.stageId === 'workspace_ready') state = 'complete';
            if (index === currentIndex) state = error ? 'failed' : 'active';
            if (stage.id === 'workspace_ready' && progress.stageId === 'workspace_ready') {
              state = 'complete';
            }
            return (
              <li
                key={stage.id}
                ref={index === currentIndex ? activeStageRef : null}
                className="generation-timeline-stage"
                data-state={state}
              >
                <span className="generation-stage-marker" aria-hidden="true">
                  <StageMarker state={state} Icon={stage.icon} />
                </span>
                <div>
                  <strong>{stage.title}</strong>
                  <p>{stage.description}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="generation-live-status" data-error={Boolean(error)} aria-live="polite">
          <span aria-hidden="true">
            {error ? (
              <X size={15} />
            ) : progress.stageId === 'workspace_ready' ? (
              <Check size={15} />
            ) : (
              <Circle size={8} fill="currentColor" />
            )}
          </span>
          <div>
            <strong>{error ? 'We paused at this step' : progress.message}</strong>
            {error ? <p>{error.message}</p> : null}
          </div>
        </div>

        {error ? (
          <div className="generation-recovery-actions">
            <Button type="button" onClick={onBack}>
              Back
            </Button>
            {error.retry ? (
              <Button type="button" variant="primary" onClick={onRetry}>
                <RotateCcw size={14} /> Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
