import { useState } from 'react';
import { ExternalLink, FileText, GitBranch, Link2, Plus, Trash2, Video } from 'lucide-react';
import { Button } from '../../../components/Button/index.js';

const types = [
  ['external_url', 'External URL'],
  ['youtube', 'YouTube'],
  ['github', 'GitHub'],
  ['pdf', 'PDF'],
  ['google_doc', 'Google Doc'],
];

function icon(type) {
  if (type === 'youtube') return <Video size={16} />;
  if (type === 'github') return <GitBranch size={16} />;
  if (type === 'pdf') return <FileText size={16} />;
  return <Link2 size={16} />;
}

function inputAttachment(attachment) {
  return {
    ...(attachment.attachmentId ? { attachmentId: attachment.attachmentId } : {}),
    type: attachment.type,
    url: attachment.url,
    title: attachment.title,
    description: attachment.description ?? null,
  };
}

export function TaskAttachments({ task, onChange }) {
  const attachments = task.attachments ?? [];
  const [type, setType] = useState('external_url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  function addAttachment(event) {
    event.preventDefault();
    if (!url.trim()) return;
    onChange([
      ...attachments.map(inputAttachment),
      { type, url: url.trim(), title: title.trim(), description: null },
    ]);
    setUrl('');
    setTitle('');
  }

  return (
    <section className="task-attachments" aria-label={`Attachments for ${task.title}`}>
      <strong>Learning resources</strong>
      {attachments.length === 0 ? (
        <p className="task-attachments-empty">
          {task.resourceStatus?.message ?? 'No suitable learning resource found.'}
        </p>
      ) : (
        <div className="task-attachment-list">
          {attachments.map((attachment) => (
            <article
              className="task-attachment-card"
              key={attachment.attachmentId ?? attachment.url}
            >
              <span className="task-attachment-icon">{icon(attachment.type)}</span>
              <div>
                <strong>
                  {attachment.title || attachment.metadata?.provider || attachment.url}
                </strong>
                <small>
                  {attachment.metadata?.provider ?? attachment.type.replaceAll('_', ' ')}
                  {attachment.metadata?.identifier ? ` · ${attachment.metadata.identifier}` : ''}
                </small>
              </div>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${attachment.title || attachment.url}`}
              >
                <ExternalLink size={14} />
              </a>
              <Button
                type="button"
                variant="danger"
                aria-label={`Remove ${attachment.title || attachment.url}`}
                onClick={() =>
                  onChange(
                    attachments
                      .filter((candidate) => candidate !== attachment)
                      .map(inputAttachment),
                  )
                }
              >
                <Trash2 size={13} />
              </Button>
            </article>
          ))}
        </div>
      )}
      <form className="task-attachment-form" onSubmit={addAttachment}>
        <select
          aria-label={`Attachment type for ${task.title}`}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {types.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="url"
          required
          placeholder="https://…"
          aria-label={`Attachment URL for ${task.title}`}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <input
          type="text"
          placeholder="Optional title"
          aria-label={`Attachment title for ${task.title}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" disabled={!url.trim()}>
          <Plus size={13} /> Add
        </Button>
      </form>
    </section>
  );
}
