import { Badge } from '../../../components/Badge/index.js';
import { Button } from '../../../components/Button/index.js';

function date(value) {
  return value ? new Date(value).toLocaleDateString() : 'Not available';
}

export function RoadmapContextPanel({ workspace }) {
  const metadata = workspace.metadata ?? {
    estimatedDuration: { weeks: workspace.estimatedWeeks ?? 0, hours: 0 },
    difficulty: workspace.difficulty,
    generationDate: workspace.generationTimestamp,
    version: workspace.currentVersion,
    sourceTypes: [],
    targetRole: null,
  };
  const stats = [
    ['Current phase', workspace.currentPhase ?? 'Complete'],
    ['Next milestone', workspace.nextMilestone ?? 'No milestone pending'],
    ['Estimated finish', date(workspace.estimatedCompletionDate)],
    ['Completed effort', `${Math.round(workspace.progress.completedMinutes / 60)}h`],
    [
      'Remaining effort',
      `${Math.round((workspace.progress.totalMinutes - workspace.progress.completedMinutes) / 60)}h`,
    ],
    ['Weekly commitment', `${workspace.weeklyCommitmentHours}h`],
  ];

  return (
    <aside className="roadmap-context-panel" aria-label="Roadmap context">
      <div className="context-panel-section">
        <div className="context-panel-heading">
          <h2>Overview</h2>
          <Badge>v{workspace.currentVersion}</Badge>
        </div>
        <div
          className="workspace-progress-track"
          aria-label={`${workspace.progress.percentage}% complete`}
        >
          <span style={{ width: `${workspace.progress.percentage}%` }} />
        </div>
        <strong className="context-progress-value">
          {workspace.progress.percentage}% complete
        </strong>
        <small>
          {workspace.progress.completedTasks} of {workspace.progress.totalTasks} tasks
        </small>
      </div>

      <dl className="context-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="context-panel-section context-version-meta">
        <h2>Version details</h2>
        <p>Generated {date(workspace.generationTimestamp)}</p>
        <p>Learning Context v{workspace.learningContextVersion}</p>
        <p>Modified {date(workspace.updatedAt)}</p>
      </div>

      <div className="context-panel-section context-version-meta">
        <h2>Roadmap metadata</h2>
        <p>
          Duration {metadata.estimatedDuration.weeks} weeks · {metadata.estimatedDuration.hours}h
        </p>
        <p>Difficulty {metadata.difficulty}</p>
        <p>Target role {metadata.targetRole ?? 'Not specified'}</p>
        <p>
          Sources {metadata.sourceTypes.length > 0 ? metadata.sourceTypes.join(', ') : 'Prompt'}
        </p>
      </div>

      {workspace.sourceAttributions?.length > 0 ? (
        <div className="context-panel-section context-source-list">
          <h2>Generated from</h2>
          {workspace.sourceAttributions.map((source) => (
            <div key={source.sourceId}>
              <strong>{source.title ?? source.identifier}</strong>
              <small>{source.sourceType.replaceAll('_', ' ')}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="context-panel-section">
        <h2>AI actions</h2>
        <div className="coming-soon-actions">
          {['Optimize Roadmap', 'Improve Plan', 'Adjust Timeline', 'Replace Resources'].map(
            (label) => (
              <Button
                key={label}
                type="button"
                disabled
                title="Coming in the Adaptive Roadmap Engine"
              >
                {label}
                <small>Coming soon</small>
              </Button>
            ),
          )}
        </div>
      </div>
    </aside>
  );
}
