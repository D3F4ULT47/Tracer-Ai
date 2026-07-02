import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Cloud, CloudOff, Globe2, LoaderCircle, Lock } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge/index.js';
import { Button } from '../components/Button/index.js';
import { Loader } from '../components/Loader/index.js';
import { Toast } from '../components/Toast/index.js';
import { ConfirmDialog } from '../features/roadmaps/components/ConfirmDialog.jsx';
import { InlineEdit } from '../features/roadmaps/components/InlineEdit.jsx';
import { RoadmapContextPanel } from '../features/roadmaps/components/RoadmapContextPanel.jsx';
import { RoadmapTree } from '../features/roadmaps/components/RoadmapTree.jsx';
import {
  useRoadmap,
  useRoadmapVisibility,
  useWorkspaceMutation,
} from '../features/roadmaps/hooks/use-roadmaps.js';

function isProtected(node) {
  return ['COMPLETED', 'LOCKED'].includes(node.state) || (node.progress?.completedTasks ?? 0) > 0;
}

function findNode(workspace, type, key) {
  if (type === 'phase') return workspace.phases.find((phase) => phase.key === key);
  for (const phase of workspace.phases) {
    if (type === 'week') {
      const week = phase.weeks.find((candidate) => candidate.key === key);
      if (week) return week;
    }
    for (const week of phase.weeks) {
      const task = week.tasks.find((candidate) => candidate.key === key);
      if (task) return task;
    }
  }
  return null;
}

function optimisticUpdate(workspace, type, key, changes) {
  const next = structuredClone(workspace);
  const node = findNode(next, type, key);
  if (node) Object.assign(node, changes);
  return next;
}

function optimisticDelete(workspace, type, key) {
  const next = structuredClone(workspace);
  if (type === 'phase') next.phases = next.phases.filter((phase) => phase.key !== key);
  for (const phase of next.phases) {
    if (type === 'week') phase.weeks = phase.weeks.filter((week) => week.key !== key);
    for (const week of phase.weeks) {
      if (type === 'task') week.tasks = week.tasks.filter((task) => task.key !== key);
    }
  }
  return next;
}

export function RoadmapWorkspacePage() {
  const { id } = useParams();
  const query = useRoadmap(id);
  const mutation = useWorkspaceMutation(id);
  const visibilityMutation = useRoadmapVisibility(id);
  const [workspaceOverride, setWorkspace] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [saveError, setSaveError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const savedTimer = useRef(null);

  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const workspace = workspaceOverride ?? query.data?.data?.workspace ?? null;

  async function persist(input, updater) {
    const previous = workspace;
    if (updater) setWorkspace(updater(workspace));
    setSaveState('saving');
    setSaveError(null);
    try {
      const response = await mutation.mutateAsync(input);
      setWorkspace(response.data.workspace);
      setSaveState('saved');
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1800);
    } catch (error) {
      setWorkspace(previous);
      setSaveState('failed');
      setSaveError(error.message);
    }
  }

  async function toggleVisibility() {
    const visibility = workspace.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    setSaveState('saving');
    setSaveError(null);
    try {
      const response = await visibilityMutation.mutateAsync({
        visibility,
        revision: workspace.revision,
      });
      setWorkspace(response.data.workspace);
      setSaveState('saved');
    } catch (error) {
      setSaveState('failed');
      setSaveError(error.message);
    }
  }

  function confirmProtected(node, action, message) {
    if (!isProtected(node)) {
      action(false);
      return;
    }
    setConfirmation({
      title: 'Edit protected progress?',
      message:
        message ??
        'This section contains completed or locked learning. Your explicit edit is allowed, but it will create a new version.',
      confirmLabel: 'Edit anyway',
      confirm: () => {
        setConfirmation(null);
        action(true);
      },
    });
  }

  const actions = workspace
    ? {
        updateNode(type, node, changes) {
          confirmProtected(node, (confirmedProtectedEdit) =>
            persist(
              {
                operation: 'updateNode',
                nodeType: type,
                nodeKey: node.key,
                changes,
                confirmedProtectedEdit,
                revision: workspace.revision,
              },
              (current) => optimisticUpdate(current, type, node.key, changes),
            ),
          );
        },
        completeGroup(type, node) {
          setConfirmation({
            title: `Complete this ${type}?`,
            message: 'Every child task will be marked completed. This remains reversible by you.',
            confirmLabel: 'Complete all tasks',
            confirm: () => {
              setConfirmation(null);
              persist({
                operation: 'updateNode',
                nodeType: type,
                nodeKey: node.key,
                changes: { state: 'COMPLETED' },
                confirmedProtectedEdit: true,
                revision: workspace.revision,
              });
            },
          });
        },
        createNode(type, parentKey, data) {
          const parent = parentKey
            ? findNode(workspace, type === 'task' ? 'week' : 'phase', parentKey)
            : null;
          confirmProtected(parent ?? { state: 'NOT_STARTED' }, (confirmedProtectedEdit) =>
            persist({
              operation: 'createNode',
              nodeType: type,
              parentKey,
              afterKey: null,
              data,
              confirmedProtectedEdit,
              revision: workspace.revision,
            }),
          );
        },
        deleteNode(type, node) {
          setConfirmation({
            title: `Delete this ${type}?`,
            message:
              'The section will be removed from the current roadmap. A version snapshot preserves its previous state.',
            danger: true,
            confirmLabel: 'Delete section',
            confirm: () => {
              setConfirmation(null);
              persist(
                {
                  operation: 'deleteNode',
                  nodeType: type,
                  nodeKey: node.key,
                  confirmedProtectedEdit: isProtected(node),
                  revision: workspace.revision,
                },
                (current) => optimisticDelete(current, type, node.key),
              );
            },
          });
        },
      }
    : null;

  if (query.isError) {
    return (
      <section className="workspace-state-page">
        <Toast tone="error">{query.error.message}</Toast>
        <Link to="/roadmaps">Return to My Roadmaps</Link>
      </section>
    );
  }
  if (query.isPending || !workspace) return <Loader label="Opening your roadmap workspace" />;

  return (
    <section className="roadmap-workspace-page">
      <header className="workspace-header">
        <div className="workspace-breadcrumb">
          <Link to="/roadmaps" aria-label="Back to My Roadmaps">
            <ArrowLeft size={16} />
          </Link>
          <Badge>{workspace.type}</Badge>
          <span>Version {workspace.currentVersion}</span>
        </div>
        <div className="workspace-title-row">
          <InlineEdit
            value={workspace.title}
            label="Roadmap title"
            className="workspace-title-input"
            onCommit={(title) =>
              confirmProtected(workspace.progress, (confirmedProtectedEdit) =>
                persist(
                  {
                    operation: 'update',
                    changes: { title },
                    confirmedProtectedEdit,
                    revision: workspace.revision,
                  },
                  (current) => ({ ...current, title }),
                ),
              )
            }
          />
          <SaveIndicator
            state={saveState}
            onRetry={() => {
              if (mutation.variables) persist(mutation.variables);
            }}
          />
          <Button type="button" onClick={toggleVisibility} disabled={visibilityMutation.isPending}>
            {workspace.visibility === 'PUBLIC' ? <Lock size={14} /> : <Globe2 size={14} />}
            {visibilityMutation.isPending
              ? 'Updating…'
              : workspace.visibility === 'PUBLIC'
                ? 'Make Private'
                : 'Publish'}
          </Button>
        </div>
        <p>{workspace.summary}</p>
        {saveError ? <Toast tone="error">Save failed: {saveError}</Toast> : null}
      </header>

      <div className="roadmap-workspace-grid">
        <main className="roadmap-workspace-center">
          <RoadmapTree workspace={workspace} actions={actions} saving={saveState === 'saving'} />
        </main>
        <RoadmapContextPanel workspace={workspace} />
      </div>
      <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />
    </section>
  );
}

function SaveIndicator({ state, onRetry }) {
  if (state === 'saving') {
    return (
      <span className="save-indicator">
        <LoaderCircle size={14} className="spin" /> Saving…
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <button type="button" className="save-indicator save-indicator--failed" onClick={onRetry}>
        <CloudOff size={14} /> Save failed
      </button>
    );
  }
  if (state === 'saved') {
    return (
      <span className="save-indicator">
        <CheckCircle2 size={14} /> Saved
      </span>
    );
  }
  return (
    <span className="save-indicator">
      <Cloud size={14} /> Autosave on
    </span>
  );
}
