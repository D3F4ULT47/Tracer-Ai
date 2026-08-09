import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  Flag,
} from 'lucide-react';
import { Badge } from '../../../components/Badge/index.js';

function PreviewResource({ task }) {
  const attachments = task.attachments ?? [];
  const primary =
    attachments.find((attachment) => attachment.metadata?.purpose === 'primary') ??
    attachments[0] ??
    null;
  if (!primary) {
    return (
      <div className="task-resource-preview task-resource-preview--empty">
        <AlertCircle size={14} />
        <span>{task.resourceStatus?.message ?? 'No suitable learning resource found.'}</span>
      </div>
    );
  }
  return (
    <div className="task-resource-preview">
      <ExternalLink size={14} />
      <a href={primary.url} target="_blank" rel="noreferrer">
        {primary.title || primary.url}
      </a>
      <small>
        {primary.metadata?.provider ?? primary.type}
        {attachments.length > 1 ? ` · +${attachments.length - 1} more` : ''}
      </small>
    </div>
  );
}

export function RoadmapPreviewTree({ roadmap }) {
  const [expanded, setExpanded] = useState(() => new Set(roadmap.phases.map((phase) => phase.key)));

  function toggle(key) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="roadmap-tree roadmap-preview-tree">
      {roadmap.phases.map((phase) => (
        <section className="roadmap-phase" key={phase.key}>
          <div className="roadmap-node-header phase-header">
            <button
              type="button"
              className="tree-toggle"
              onClick={() => toggle(phase.key)}
              aria-label={`${expanded.has(phase.key) ? 'Collapse' : 'Expand'} ${phase.title}`}
            >
              {expanded.has(phase.key) ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            </button>
            <div className="node-title-block">
              <span className="node-kicker">Phase {phase.order}</span>
              <strong className="preview-node-title">{phase.title}</strong>
            </div>
            <Badge>{phase.estimatedWeeks} weeks</Badge>
          </div>
          {expanded.has(phase.key) ? (
            <div className="phase-content">
              {phase.milestones.length ? (
                <div className="milestone-strip">
                  <Flag size={14} /> {phase.milestones.join(' · ')}
                </div>
              ) : null}
              {phase.weeks.map((week) => (
                <article className="roadmap-week" key={week.key}>
                  <div className="roadmap-node-header week-header">
                    <button
                      type="button"
                      className="tree-toggle"
                      onClick={() => toggle(week.key)}
                      aria-label={`${expanded.has(week.key) ? 'Collapse' : 'Expand'} ${week.title}`}
                    >
                      {expanded.has(week.key) ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                    <span className="week-number">W{week.weekNumber}</span>
                    <strong className="preview-node-title">{week.title}</strong>
                    <span className="task-count">{week.tasks.length} tasks</span>
                  </div>
                  {expanded.has(week.key) ? (
                    <div className="week-content">
                      {week.tasks.map((task) => (
                        <div className="roadmap-task" key={task.key}>
                          <div className="task-main-row">
                            <span className="task-checkbox" aria-hidden="true">
                              {task.state === 'COMPLETED' ? (
                                <Check size={14} />
                              ) : (
                                <Circle size={14} />
                              )}
                            </span>
                            <strong className="preview-task-title">{task.title}</strong>
                            <Badge>{task.difficulty}</Badge>
                            <span className="task-duration">
                              <Clock3 size={13} /> {task.estimatedMinutes}m
                            </span>
                          </div>
                          <PreviewResource task={task} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
