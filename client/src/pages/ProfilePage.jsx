import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Avatar } from '../components/Avatar/index.js';
import { Badge } from '../components/Badge/index.js';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Input } from '../components/Input/index.js';
import { Loader } from '../components/Loader/index.js';
import { Select } from '../components/Select/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';
import { useCurrentUser } from '../features/auth/hooks/use-auth.js';
import { userApi } from '../features/users/api/user-api.js';
import {
  useLearningProfile,
  useUpdateLearningProfile,
} from '../features/users/hooks/use-learning-profile.js';
import { useProfile, useUpdateProfile } from '../features/users/hooks/use-profile.js';

const tabs = [
  'General',
  'Resume',
  'Skills',
  'Learning Preferences',
  'Connected Accounts',
  'Privacy',
  'Security',
  'Sessions',
];

function QueryState({ query, empty, children }) {
  if (query.isPending) return <Loader />;
  if (query.isError) return <Toast tone="error">{query.error.message}</Toast>;
  if (empty) return <div className="empty-state">Nothing here yet.</div>;
  return children;
}

export function ProfilePage() {
  const [activeTab, setActiveTab] = useState('General');
  const currentUser = useCurrentUser();
  return (
    <section className="profile-page">
      <header className="profile-heading">
        <Avatar name={currentUser.data?.data?.user?.email} />
        <div>
          <p className="eyebrow">Account settings</p>
          <h1>Profile</h1>
        </div>
      </header>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Profile settings">
          {tabs.map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'selected' : 'link'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </nav>
        <div>
          <Card>
            <ProfileTab tab={activeTab} currentUser={currentUser} />
          </Card>
        </div>
      </div>
    </section>
  );
}

function ProfileTab({ tab, currentUser }) {
  if (tab === 'General') return <GeneralTab />;
  if (tab === 'Resume') return <ResumeTab />;
  if (tab === 'Skills') return <SkillsTab />;
  if (tab === 'Learning Preferences') return <LearningPreferencesTab />;
  if (tab === 'Connected Accounts') return <ConnectedAccountsTab currentUser={currentUser} />;
  if (tab === 'Privacy') return <PrivacyTab />;
  if (tab === 'Security') return <SecurityTab />;
  return <SessionsTab />;
}

function GeneralTab() {
  const query = useProfile();
  const update = useUpdateProfile();
  function submit(event) {
    event.preventDefault();
    update.mutate({ name: new FormData(event.currentTarget).get('name') });
  }
  return (
    <div>
      <h2>General</h2>
      <QueryState query={query}>
        {query.data ? (
          <form className="form-stack" onSubmit={submit}>
            <Input
              id="profile-name"
              name="name"
              label="Name"
              defaultValue={query.data.data.profile.name}
              required
            />
            {update.isError ? <Toast tone="error">{update.error.message}</Toast> : null}
            {update.isSuccess ? <Toast>Profile saved.</Toast> : null}
            <Button variant="primary" disabled={update.isPending}>
              Save changes
            </Button>
          </form>
        ) : null}
      </QueryState>
    </div>
  );
}

function ResumeTab() {
  const query = useQuery({ queryKey: ['users', 'resumes'], queryFn: userApi.resumes });
  const resumes = query.data?.data?.resumes ?? [];
  return (
    <div>
      <h2>Resume</h2>
      <p className="muted">Resume uploads and version creation begin in Sprint 3.</p>
      <QueryState query={query} empty={!query.isPending && resumes.length === 0}>
        {resumes.map((resume) => (
          <div key={resume._id}>{resume.name}</div>
        ))}
      </QueryState>
    </div>
  );
}

function SkillsTab() {
  const query = useProfile();
  const update = useUpdateProfile();
  function submit(event) {
    event.preventDefault();
    const skills = new FormData(event.currentTarget)
      .get('skills')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    update.mutate({ skills: [...new Set(skills)] });
  }
  return (
    <div>
      <h2>Skills</h2>
      <QueryState query={query}>
        {query.data ? (
          <form className="form-stack" onSubmit={submit}>
            <Input
              id="profile-skills"
              name="skills"
              label="Skills, separated by commas"
              defaultValue={query.data.data.profile.skills.join(', ')}
            />
            {update.isError ? <Toast tone="error">{update.error.message}</Toast> : null}
            {update.isSuccess ? <Toast>Skills saved.</Toast> : null}
            <Button variant="primary">Save skills</Button>
          </form>
        ) : null}
      </QueryState>
    </div>
  );
}

function LearningPreferencesTab() {
  const query = useLearningProfile();
  const update = useUpdateLearningProfile();
  function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    update.mutate({ ...data, weeklyHours: Number(data.weeklyHours) });
  }
  const profile = query.data?.data?.learningProfile;
  return (
    <div>
      <h2>Learning Preferences</h2>
      <QueryState query={query}>
        {profile ? (
          <>
            <form className="form-stack" onSubmit={submit}>
              <Input
                id="preferred-language"
                name="preferredLanguage"
                label="Preferred language"
                defaultValue={profile.preferredLanguage ?? ''}
              />
              <Select
                id="learning-pace"
                name="learningPace"
                label="Learning pace"
                defaultValue={profile.learningPace}
              >
                <option value="slow">Slow</option>
                <option value="balanced">Balanced</option>
                <option value="fast">Fast</option>
              </Select>
              <Input
                id="weekly-hours"
                name="weeklyHours"
                type="number"
                min="1"
                max="168"
                label="Weekly hours"
                defaultValue={profile.weeklyHours ?? 5}
              />
              {update.isError ? <Toast tone="error">{update.error.message}</Toast> : null}
              {update.isSuccess ? <Toast>Learning preferences saved.</Toast> : null}
              <Button variant="primary">Save preferences</Button>
            </form>
            <h3>AI assumptions</h3>
            {profile.inferences.length === 0 ? (
              <div className="empty-state">No AI assumptions yet.</div>
            ) : (
              profile.inferences.map((item) => (
                <div className="inference-row" key={item.field}>
                  <span>{item.field}</span>
                  <Badge>{Math.round(item.aiConfidence * 100)}% confidence</Badge>
                  <small>
                    {item.aiSource} · Updated {new Date(item.updatedAt).toLocaleDateString()}
                  </small>
                </div>
              ))
            )}
          </>
        ) : null}
      </QueryState>
    </div>
  );
}

function ConnectedAccountsTab({ currentUser }) {
  const accounts = currentUser.data?.data?.user?.connectedAccounts ?? [];
  return (
    <div>
      <h2>Connected Accounts</h2>
      <QueryState query={currentUser} empty={!currentUser.isPending && accounts.length === 0}>
        {accounts.map((account) => (
          <div className="list-row" key={account}>
            <span>{account}</span>
            <Badge tone="success">Connected</Badge>
          </div>
        ))}
      </QueryState>
    </div>
  );
}

function PrivacyTab() {
  const queryClient = useQueryClient();
  const deletion = useMutation({
    mutationFn: userApi.scheduleDeletion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
  return (
    <div>
      <h2>Privacy</h2>
      <p>Account deletion is recoverable for 30 days.</p>
      {deletion.isError ? <Toast tone="error">{deletion.error.message}</Toast> : null}
      {deletion.isSuccess ? <Toast>Account deletion scheduled.</Toast> : null}
      <Button variant="danger" onClick={() => deletion.mutate()} disabled={deletion.isPending}>
        Schedule account deletion
      </Button>
    </div>
  );
}

function SecurityTab() {
  return (
    <div>
      <h2>Security</h2>
      <p>
        Password, verification, OAuth connections, and session security are protected by the
        authentication module.
      </p>
      <Badge tone="success">HTTP-only sessions enabled</Badge>
    </div>
  );
}

function SessionsTab() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authApi.sessions });
  const revoke = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
  const sessions = query.data?.data?.sessions ?? [];
  return (
    <div>
      <h2>Sessions</h2>
      {revoke.isError ? <Toast tone="error">{revoke.error.message}</Toast> : null}
      {revoke.isSuccess ? <Toast>Session revoked.</Toast> : null}
      <QueryState query={query} empty={!query.isPending && sessions.length === 0}>
        {sessions.map((session) => (
          <div className="list-row" key={session._id}>
            <div>
              <strong>{session.userAgent || 'Unknown device'}</strong>
              <small>
                {session.ipAddress || 'Unknown location'} · Last used{' '}
                {new Date(session.lastUsedAt).toLocaleString()}
              </small>
            </div>
            {session._id === query.data.data.currentSessionId ? (
              <Badge>Current</Badge>
            ) : (
              <Button variant="danger" onClick={() => revoke.mutate(session._id)}>
                Revoke
              </Button>
            )}
          </div>
        ))}
      </QueryState>
    </div>
  );
}
