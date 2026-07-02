import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Flag,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { Badge } from '../../../components/Badge/index.js';
import { Button } from '../../../components/Button/index.js';
import { InlineAdd } from './InlineAdd.jsx';
import { InlineEdit } from './InlineEdit.jsx';
import { TaskAttachments } from './TaskAttachments.jsx';

function statusLabel(state) {
  return state.toLowerCase().replaceAll('_', ' ');
}

function Progress({ value }) {
  return (
    <span className="tree-progress" title={`${value.percentage}% complete`}>
      <span style={{ width: `${value.percentage}%` }} />
    </span>
  );
}

export function RoadmapTree({ workspace, actions, saving }) {
  const [expanded, setExpanded] = useState(
    () => new Set(workspace.phases.slice(0, 1).map((p) => p.key)),
  );

  function toggle(key) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="roadmap-tree">
      {workspace.phases.length === 0 ? (
        <div className="workspace-empty-section">
          <Flag size={22} />
          <h2>Start your first phase</h2>
          <p>Add a phase to rebuild this roadmap into a useful learning sequence.</p>
        </div>
      ) : null}
      {workspace.phases.map((phase) => (
        <section className="roadmap-phase" key={phase.key} data-state={phase.state}>
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
              <InlineEdit
                value={phase.title}
                label="Phase title"
                className="phase-title-input"
                onCommit={(title) => actions.updateNode('phase', phase, { title })}
              />
            </div>
            <Progress value={phase.progress} />
            <Badge>{statusLabel(phase.state)}</Badge>
            <Button
              type="button"
              title="Complete every task in this phase"
              onClick={() => actions.completeGroup('phase', phase)}
            >
              <Check size={14} />
              Complete phase
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => actions.deleteNode('phase', phase)}
            >
              <Trash2 size={14} />
            </Button>
          </div>

          {expanded.has(phase.key) ? (
            <div className="phase-content">
              {phase.milestones.length > 0 ? (
                <div className="milestone-strip">
                  <Flag size={14} />
                  {phase.milestones.join(' · ')}
                </div>
              ) : null}
              {phase.weeks.map((week) => (
                <Week
                  key={week.key}
                  week={week}
                  expanded={expanded}
                  toggle={toggle}
                  actions={actions}
                  saving={saving}
                />
              ))}
              <InlineAdd
                label="Add week"
                placeholder="Week title"
                disabled={saving}
                onAdd={(title) => actions.createNode('week', phase.key, { title })}
              />
            </div>
          ) : null}
        </section>
      ))}
      <InlineAdd
        label="Add phase"
        placeholder="Phase title"
        disabled={saving}
        onAdd={(title) => actions.createNode('phase', null, { title })}
      />
    </div>
  );
}

function Week({ week, expanded, toggle, actions, saving }) {
  return (
    <article className="roadmap-week" data-state={week.state}>
      <div className="roadmap-node-header week-header">
        <button
          type="button"
          className="tree-toggle"
          onClick={() => toggle(week.key)}
          aria-label={`${expanded.has(week.key) ? 'Collapse' : 'Expand'} ${week.title}`}
        >
          {expanded.has(week.key) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <span className="week-number">W{week.weekNumber}</span>
        <InlineEdit
          value={week.title}
          label="Week title"
          className="week-title-input"
          onCommit={(title) => actions.updateNode('week', week, { title })}
        />
        <Progress value={week.progress} />
        <span className="task-count">{week.progress.totalTasks} tasks</span>
        <Button type="button" onClick={() => actions.completeGroup('week', week)}>
          <Check size={14} />
          Complete
        </Button>
        <Button type="button" variant="danger" onClick={() => actions.deleteNode('week', week)}>
          <Trash2 size={14} />
        </Button>
      </div>

      {expanded.has(week.key) ? (
        <div className="week-content">
          {week.tasks.map((task) => (
            <Task key={task.key} task={task} actions={actions} />
          ))}
          <InlineAdd
            label="Add task"
            placeholder="Task title"
            disabled={saving}
            onAdd={(title) => actions.createNode('task', week.key, { title })}
          />
        </div>
      ) : null}
    </article>
  );
}

function Task({ task, actions }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const completed = task.state === 'COMPLETED';
  return (
    <div className="roadmap-task" data-state={task.state}>
      <div className="task-main-row">
        <button
          type="button"
          className="task-checkbox"
          aria-label={completed ? `Mark ${task.title} not started` : `Complete ${task.title}`}
          aria-pressed={completed}
          onClick={() =>
            actions.updateNode('task', task, {
              state: completed ? 'NOT_STARTED' : 'COMPLETED',
            })
          }
        >
          {completed ? <Check size={14} /> : <Circle size={14} />}
        </button>
        <InlineEdit
          value={task.title}
          label="Task title"
          className="task-title-input"
          onCommit={(title) => actions.updateNode('task', task, { title })}
        />
        <Badge>{task.difficulty}</Badge>
        <span className="task-duration">
          <Clock3 size={13} />
          {task.estimatedMinutes}m
        </span>
        <select
          className="task-status-select"
          aria-label={`Status for ${task.title}`}
          value={task.state}
          onChange={(event) => actions.updateNode('task', task, { state: event.target.value })}
        >
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="LOCKED">Locked</option>
        </select>
        <Button
          type="button"
          aria-label={`Details for ${task.title}`}
          onClick={() => setOpen(!open)}
        >
          <MoreHorizontal size={15} />
        </Button>
        <Button type="button" variant="danger" onClick={() => actions.deleteNode('task', task)}>
          <Trash2 size={14} />
        </Button>
      </div>
      {open ? (
        <div className="task-details">
          <label>
            Description
            <InlineEdit
              multiline
              debounceMs={750}
              value={task.description}
              label="Task description"
              onCommit={(description) => actions.updateNode('task', task, { description })}
            />
          </label>
          <label>
            Estimated minutes
            <input
              type="number"
              min="5"
              max="2400"
              defaultValue={task.estimatedMinutes}
              onBlur={(event) => {
                const estimatedMinutes = Number(event.target.value);
                if (estimatedMinutes !== task.estimatedMinutes) {
                  actions.updateNode('task', task, { estimatedMinutes });
                }
              }}
            />
          </label>
          <div className="task-notes">
            <strong>Private notes</strong>
            {task.notes.map((item) => (
              <div className="task-note" key={item.noteId}>
                <InlineEdit
                  multiline
                  debounceMs={750}
                  value={item.content}
                  label="Private task note"
                  onCommit={(content) =>
                    actions.updateNode('task', task, {
                      notes: task.notes.map((candidate) => ({
                        noteId: candidate.noteId,
                        content: candidate.noteId === item.noteId ? content : candidate.content,
                      })),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="danger"
                  aria-label="Delete private note"
                  onClick={() =>
                    actions.updateNode('task', task, {
                      notes: task.notes
                        .filter((candidate) => candidate.noteId !== item.noteId)
                        .map(({ noteId, content }) => ({ noteId, content })),
                    })
                  }
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
            <textarea
              rows="2"
              placeholder="Add a note…"
              aria-label={`Add note to ${task.title}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button
              type="button"
              disabled={!note.trim()}
              onClick={() => {
                actions.updateNode('task', task, {
                  notes: [
                    ...task.notes.map(({ noteId, content }) => ({ noteId, content })),
                    { content: note.trim() },
                  ],
                });
                setNote('');
              }}
            >
              Add note
            </Button>
          </div>
          <TaskAttachments
            task={task}
            onChange={(attachments) => actions.updateNode('task', task, { attachments })}
          />
        </div>
      ) : null}
    </div>
  );
}
