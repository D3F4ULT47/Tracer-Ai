import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LockKeyhole, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '../components/Badge/index.js';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Toast } from '../components/Toast/index.js';
import { rememberAuthReturn } from '../features/auth/auth-return.js';
import { useCurrentUser } from '../features/auth/hooks/use-auth.js';
import { RoadmapContextPanel } from '../features/roadmaps/components/RoadmapContextPanel.jsx';
import { RoadmapPreviewTree } from '../features/roadmaps/components/RoadmapPreviewTree.jsx';
import { usePersistRoadmapPreview } from '../features/roadmaps/hooks/use-roadmap-generation.js';
import {
  clearRoadmapPreview,
  consumePreviewSaveIntent,
  loadRoadmapPreview,
  rememberPreviewSaveIntent,
} from '../features/roadmaps/preview-storage.js';
import { useAppStore } from '../store/use-app-store.js';

function taskStats(roadmap) {
  const tasks = roadmap.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.tasks));
  const totalMinutes = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return {
    state: 'NOT_STARTED',
    percentage: 0,
    completedTasks: 0,
    totalTasks: tasks.length,
    completedMinutes: 0,
    totalMinutes,
  };
}

export function RoadmapPreviewPage() {
  const [preview] = useState(() => loadRoadmapPreview());
  const auth = useCurrentUser();
  const persist = usePersistRoadmapPreview();
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentRoadmapId = useAppStore((state) => state.setCurrentRoadmapId);
  const [stage, setStage] = useState(null);
  const automaticSaveStarted = useRef(false);
  const roadmap = preview?.roadmap;
  const context = preview?.context;
  const sourceUnderstanding = preview?.sourceUnderstanding;
  const generationMetadata = preview?.generationMetadata;
  const isAuthenticated = Boolean(auth.data?.data?.user);

  const persistPreview = useCallback(() => {
    if (!context) return;
    persist.mutate(
      { context, sourceUnderstanding, onStage: setStage },
      {
        onSuccess: (result) => {
          clearRoadmapPreview();
          setCurrentRoadmapId(result.roadmapId);
          navigate(`/roadmaps/${result.roadmapId}`);
        },
      },
    );
  }, [context, navigate, persist, setCurrentRoadmapId, sourceUnderstanding]);

  useEffect(() => {
    if (!roadmap || !context || !isAuthenticated || automaticSaveStarted.current) return;
    if (!consumePreviewSaveIntent()) return;
    automaticSaveStarted.current = true;
    persistPreview();
  }, [context, isAuthenticated, persistPreview, roadmap]);

  if (!roadmap || !context) {
    return (
      <section className="workspace-state-page">
        <Card className="roadmaps-empty-state">
          <Sparkles size={28} />
          <h1>Your preview has expired</h1>
          <p>Describe your goal again and we’ll rebuild the complete roadmap.</p>
          <Link className="ui-button ui-button--primary" to="/#composer">
            Create a roadmap
          </Link>
        </Card>
      </section>
    );
  }

  const progress = taskStats(roadmap);
  const workspace = {
    ...roadmap,
    currentVersion: 0,
    progress,
    currentPhase: roadmap.phases[0]?.title ?? null,
    nextMilestone:
      roadmap.phases[0]?.weeks[0]?.milestones[0] ?? roadmap.phases[0]?.milestones[0] ?? null,
    estimatedCompletionDate: new Date(
      Date.parse(generationMetadata.generatedAt) + roadmap.estimatedWeeks * 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    generationTimestamp: generationMetadata.generatedAt,
    learningContextVersion: generationMetadata.learningContextVersion,
    updatedAt: generationMetadata.generatedAt,
  };
  function saveRoadmap() {
    if (!isAuthenticated) {
      rememberPreviewSaveIntent();
      rememberAuthReturn(location);
      navigate('/login', { state: { from: location } });
      return;
    }
    persistPreview();
  }

  return (
    <section className="roadmap-workspace-page preview-workspace-page">
      <header className="workspace-header preview-header">
        <div className="workspace-breadcrumb">
          <Link to="/" aria-label="Back to composer">
            <ArrowLeft size={16} />
          </Link>
          <Badge>Preview</Badge>
          <span>Not saved yet</span>
        </div>
        <div className="preview-title-actions">
          <div>
            <h1>{roadmap.title}</h1>
            <p>{roadmap.summary}</p>
          </div>
          <Button variant="primary" onClick={saveRoadmap} disabled={persist.isPending}>
            <LockKeyhole size={15} />
            {persist.isPending
              ? 'Saving…'
              : isAuthenticated
                ? 'Save to My Roadmaps'
                : 'Sign in to save'}
          </Button>
        </div>
        {stage ? (
          <div className="generation-stage">
            <span className="spin-dot" /> {stage}
          </div>
        ) : null}
        {persist.isError ? (
          <Toast tone="error">We couldn’t save this roadmap. Your preview is safe—try again.</Toast>
        ) : null}
      </header>
      <div className="roadmap-workspace-grid">
        <main className="roadmap-workspace-center">
          <RoadmapPreviewTree roadmap={roadmap} />
        </main>
        <RoadmapContextPanel workspace={workspace} />
      </div>
    </section>
  );
}
