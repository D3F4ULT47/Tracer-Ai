import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAppStore } from '../store/use-app-store.js';
import { HomePage } from './HomePage.jsx';

const mocks = vi.hoisted(() => ({
  authenticated: false,
  profileName: null,
  generationResult: null,
  generateInput: null,
  activities: [],
  communityRoadmaps: [],
}));

vi.mock('../features/auth/hooks/use-auth.js', () => ({
  useCurrentUser: () => ({
    data: mocks.authenticated ? { data: { user: { email: 'learner@example.com' } } } : null,
    isPending: false,
  }),
}));

vi.mock('../features/roadmaps/hooks/use-roadmap-generation.js', () => ({
  useGenerateRoadmap: () => ({
    isPending: false,
    mutate(input, callbacks) {
      mocks.generateInput = input;
      callbacks.onSuccess(mocks.generationResult);
    },
  }),
  useAnswerRoadmapClarification: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock('../features/activity/hooks/use-activity.js', () => ({
  useRecentActivity: ({ enabled }) => ({
    data: enabled ? { data: { activities: mocks.activities, nextCursor: null } } : null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../features/community/hooks/use-community-feed.js', () => ({
  useCommunityFeed: () => ({
    data: { data: { roadmaps: mocks.communityRoadmaps } },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../features/users/hooks/use-profile.js', () => ({
  useProfile: () => ({
    data: mocks.profileName ? { data: { profile: { name: mocks.profileName } } } : null,
    isPending: false,
    isError: false,
  }),
}));

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.authenticated = false;
  mocks.profileName = null;
  mocks.generationResult = null;
  mocks.generateInput = null;
  mocks.activities = [];
  mocks.communityRoadmaps = [];
  useAppStore.setState({ composerDraft: '', experienceLevel: 'intermediate' });
});

function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<div>Authentication required</div>} />
        <Route path="/roadmaps/preview" element={<div>Anonymous Roadmap Preview</div>} />
        <Route path="/roadmaps/:id" element={<div>Interactive Roadmap Workspace</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Home roadmap generation flow', () => {
  it('shows honest backend empty states without fabricated homepage data', () => {
    renderHome();

    expect(
      screen.getByText(/Transform any goal, document, repository, project, video/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Paste a goal, upload a PDF, connect a GitHub repository/),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Activity' })).toBeInTheDocument();
    expect(
      screen.getByText('Your learning activity will appear here as you make progress.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No public roadmaps yet. Publish your roadmap to inspire the community.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Advanced SELECT Queries')).not.toBeInTheDocument();
    expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading recent roadmaps…')).not.toBeInTheDocument();
    expect(screen.queryByText('AI-native roadmap operating system')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Input type' })).not.toBeInTheDocument();
    expect(screen.queryByText('Auto detect')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create your roadmap' }).parentElement).toHaveClass(
      'home-hero-heading',
    );
  });

  it('renders only backend-provided activity and public roadmaps', () => {
    mocks.authenticated = true;
    mocks.activities = [
      {
        activityId: '11111111-1111-4111-8111-111111111111',
        roadmapId: '22222222-2222-4222-8222-222222222222',
        roadmapTitle: 'Backend Engineering',
        activityType: 'TASK_COMPLETED',
        entityType: 'task',
        entityId: 'api-design',
        shortDescription: 'Completed API design.',
        timestamp: new Date().toISOString(),
        metadata: {},
      },
    ];
    mocks.communityRoadmaps = [
      {
        roadmapId: '33333333-3333-4333-8333-333333333333',
        title: 'Public React Roadmap',
        summary: 'A public roadmap from the backend.',
        type: 'skill',
        difficulty: 'beginner',
        estimatedWeeks: 8,
        creatorName: 'A Learner',
        publishedAt: new Date().toISOString(),
      },
    ];

    renderHome();

    expect(screen.getByText('Completed API design.')).toBeInTheDocument();
    expect(screen.getByText('Public React Roadmap')).toBeInTheDocument();
    expect(screen.getByText('A Learner')).toBeInTheDocument();
  });

  it('personalizes the authenticated hero with the learner first name', () => {
    mocks.authenticated = true;
    mocks.profileName = 'Nishchay Kumar';
    renderHome();

    expect(
      screen.getByRole('heading', { name: 'Nishchay, create your next roadmap.' }),
    ).toBeInTheDocument();
  });

  it('puts a suggested goal into the composer without generating it', async () => {
    renderHome();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Build an AI Agent' }));

    expect(screen.getByRole('textbox', { name: 'Describe your learning goal' })).toHaveValue(
      'Build an AI Agent',
    );
    expect(mocks.generateInput).toBeNull();
  });

  it('generates an anonymous preview without requesting authentication', async () => {
    mocks.generationResult = {
      status: 'generated',
      persisted: false,
      roadmap: { title: 'Backend Roadmap' },
      context: { contextVersion: 1 },
      generationMetadata: { generatedAt: '2026-01-01T00:00:00.000Z' },
    };
    renderHome();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Describe your learning goal' }),
      'Become a backend engineer',
    );
    expect(screen.queryByRole('combobox', { name: 'Experience level' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate roadmap' }));

    expect(mocks.generateInput).toBeNull();
    expect(
      screen.getByRole('dialog', { name: 'How familiar are you with this topic?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This helps us recommend resources that better match your current level.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Anonymous Roadmap Preview')).toBeInTheDocument();
    expect(screen.queryByText('Authentication required')).not.toBeInTheDocument();
    expect(mocks.generateInput).toMatchObject({
      goal: 'Become a backend engineer',
      experienceLevel: 'advanced',
    });
    expect(useAppStore.getState().composerDraft).toBe('Become a backend engineer');
  });

  it('defaults to Not sure and continues when the proficiency prompt is dismissed', async () => {
    mocks.authenticated = true;
    mocks.generationResult = {
      status: 'generated',
      persisted: true,
      roadmapId: 'd2e4439c-8f14-47dd-9280-a2a3cc1029fd',
    };
    renderHome();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Describe your learning goal' }),
      'Learn frontend engineering',
    );
    await user.click(screen.getByRole('button', { name: 'Generate roadmap' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss proficiency prompt' }));

    expect(screen.getByText('Interactive Roadmap Workspace')).toBeInTheDocument();
    expect(mocks.generateInput.goal).toBe('Learn frontend engineering');
    expect(mocks.generateInput.experienceLevel).toBeNull();
    expect(useAppStore.getState().currentRoadmapId).toBe('d2e4439c-8f14-47dd-9280-a2a3cc1029fd');
  });
});
