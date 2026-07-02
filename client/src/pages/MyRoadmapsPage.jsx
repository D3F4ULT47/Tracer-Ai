import { useState } from 'react';
import { Bookmark, Copy, FolderOpen, GitFork, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../components/Badge/index.js';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Loader } from '../components/Loader/index.js';
import { Toast } from '../components/Toast/index.js';
import { ConfirmDialog } from '../features/roadmaps/components/ConfirmDialog.jsx';
import {
  useDeleteRoadmap,
  useDuplicateRoadmap,
  useRoadmaps,
} from '../features/roadmaps/hooks/use-roadmaps.js';

function date(value) {
  return value ? new Date(value).toLocaleDateString() : 'Never';
}

export function MyRoadmapsPage() {
  const query = useRoadmaps();
  const duplicate = useDuplicateRoadmap();
  const remove = useDeleteRoadmap();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState(null);
  const [message, setMessage] = useState(null);
  const [category, setCategory] = useState('mine');
  const roadmaps = query.data?.data?.roadmaps ?? [];

  if (query.isPending) return <Loader label="Loading your roadmaps" />;
  if (query.isError) {
    return (
      <section className="workspace-state-page">
        <Toast tone="error">{query.error.message}</Toast>
        <Button onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Retrying…' : 'Try again'}
        </Button>
      </section>
    );
  }

  return (
    <section className="my-roadmaps-page">
      <header className="my-roadmaps-header">
        <div>
          <p className="eyebrow">Learning workspace</p>
          <h1>My Roadmaps</h1>
          <p>Continue a roadmap or begin a fresh learning attempt.</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/#composer')}>
          <Plus size={15} /> Create roadmap
        </Button>
      </header>
      {message ? <Toast tone={message.tone}>{message.text}</Toast> : null}

      <nav className="roadmap-categories" aria-label="Roadmap categories">
        {[
          ['saved', 'Saved', 0],
          ['mine', 'My Roadmaps', roadmaps.length],
          ['forked', 'Forked', 0],
        ].map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            className={category === value ? 'active' : ''}
            aria-current={category === value ? 'page' : undefined}
            onClick={() => setCategory(value)}
          >
            {label} <span>{count}</span>
          </button>
        ))}
      </nav>

      {category !== 'mine' ? (
        <Card className="roadmaps-empty-state">
          {category === 'saved' ? <Bookmark size={30} /> : <GitFork size={30} />}
          <h2>{category === 'saved' ? 'No saved roadmaps yet' : 'No forked roadmaps yet'}</h2>
          <p>
            {category === 'saved'
              ? 'Roadmaps you bookmark from the community will be collected here.'
              : 'Roadmaps you fork into your own learning workspace will appear here.'}
          </p>
          <Button onClick={() => setCategory('mine')}>View my roadmaps</Button>
        </Card>
      ) : roadmaps.length === 0 ? (
        <Card className="roadmaps-empty-state">
          <FolderOpen size={30} />
          <h2>Create your first roadmap</h2>
          <p>Describe what you want to learn and Tracer AI will build the complete plan.</p>
          <Link className="ui-button ui-button--primary" to="/#composer">
            Open the homepage composer
          </Link>
        </Card>
      ) : (
        <div className="roadmap-list-grid">
          {roadmaps.map((roadmap) => (
            <Card className="roadmap-list-card" key={roadmap.roadmapId}>
              <div className="roadmap-list-card-heading">
                <div>
                  <Badge>{roadmap.type}</Badge>
                  <h2>{roadmap.title}</h2>
                </div>
                <Badge>v{roadmap.currentVersion}</Badge>
              </div>
              <div className="workspace-progress-track">
                <span style={{ width: `${roadmap.progress.percentage}%` }} />
              </div>
              <div className="roadmap-list-meta">
                <span>{roadmap.progress.percentage}% complete</span>
                <span>Created {date(roadmap.createdAt)}</span>
                <span>Last opened {date(roadmap.lastOpenedAt)}</span>
              </div>
              <div className="roadmap-list-actions">
                <Button
                  variant="primary"
                  onClick={() => navigate(`/roadmaps/${roadmap.roadmapId}`)}
                >
                  Open
                </Button>
                <Button
                  onClick={() =>
                    duplicate.mutate(roadmap.roadmapId, {
                      onSuccess: (response) =>
                        navigate(`/roadmaps/${response.data.workspace.roadmapId}`),
                      onError: (error) => setMessage({ tone: 'error', text: error.message }),
                    })
                  }
                  disabled={duplicate.isPending}
                >
                  <Copy size={14} /> Duplicate
                </Button>
                <Button disabled title="Archive controls are coming later">
                  Archive
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setConfirmation({
                      title: 'Move roadmap to deleted items?',
                      message:
                        'The roadmap remains recoverable and will not be permanently removed.',
                      danger: true,
                      confirmLabel: 'Delete roadmap',
                      confirm: () => {
                        setConfirmation(null);
                        remove.mutate(roadmap.roadmapId, {
                          onSuccess: () =>
                            setMessage({
                              tone: 'default',
                              text: 'Roadmap moved to deleted items.',
                            }),
                          onError: (error) => setMessage({ tone: 'error', text: error.message }),
                        });
                      },
                    })
                  }
                >
                  <Trash2 size={14} /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} />
    </section>
  );
}
