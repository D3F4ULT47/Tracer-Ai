import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAppStore } from '../store/use-app-store.js';
import { RoadmapWorkspacePage } from './RoadmapWorkspacePage.jsx';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), visibilityMutateAsync: vi.fn() }));

const workspace = {
  roadmapId: 'd2e4439c-8f14-47dd-9280-a2a3cc1029fd',
  title: 'Frontend Roadmap',
  roadmapLabel: 'Frontend',
  roadmapIdentifier: 'Frontend • Intermediate',
  description: 'Learn frontend.',
  summary: 'A practical frontend path.',
  summaryLine: 'A practical frontend path.',
  type: 'skill',
  difficulty: 'intermediate',
  visibility: 'PRIVATE',
  publishedAt: null,
  weeklyCommitmentHours: 10,
  currentVersion: 1,
  revision: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastOpenedAt: null,
  generationTimestamp: '2026-01-01T00:00:00.000Z',
  learningContextVersion: 2,
  currentPhase: 'Foundations',
  nextMilestone: 'First milestone',
  estimatedCompletionDate: '2026-02-01T00:00:00.000Z',
  progress: {
    state: 'NOT_STARTED',
    percentage: 0,
    completedTasks: 0,
    totalTasks: 1,
    completedMinutes: 0,
    totalMinutes: 60,
  },
  dashboard: {
    progressMade: {
      percentage: 0,
      completedTasks: 0,
      totalTasks: 1,
    },
    learningVelocity: { minutesToday: 0 },
    currentStreak: { days: 0 },
    nextMilestone: { title: 'First milestone', remainingMinutes: 60 },
  },
  metadata: {
    estimatedDuration: { weeks: 1, hours: 1 },
    difficulty: 'intermediate',
    generationDate: '2026-01-01T00:00:00.000Z',
    version: 1,
    sourceTypes: ['github_repository'],
    targetRole: 'Frontend Engineer',
  },
  sourceAttributions: [
    {
      sourceId: '11111111-1111-4111-8111-111111111111',
      sourceType: 'github_repository',
      identifier: 'example/frontend@main',
      title: 'example/frontend',
      url: 'https://github.com/example/frontend',
      creator: 'example',
      capturedAt: '2026-01-01T00:00:00.000Z',
      relevantLocations: [],
    },
  ],
  phases: [
    {
      key: 'phase-one',
      title: 'Foundations',
      description: 'Foundations',
      objective: 'Learn basics',
      estimatedWeeks: 1,
      order: 1,
      state: 'NOT_STARTED',
      milestones: ['First milestone'],
      projects: [],
      checkpoints: [],
      completionCriteria: ['Done'],
      progress: {
        state: 'NOT_STARTED',
        percentage: 0,
        completedTasks: 0,
        totalTasks: 1,
        completedMinutes: 0,
        totalMinutes: 60,
      },
      weeks: [
        {
          key: 'week-one',
          title: 'Week One',
          description: 'Start',
          objective: 'Learn',
          weekNumber: 1,
          order: 1,
          state: 'NOT_STARTED',
          milestones: ['First milestone'],
          projects: [],
          checkpoints: [],
          completionCriteria: ['Done'],
          progress: {
            state: 'NOT_STARTED',
            percentage: 0,
            completedTasks: 0,
            totalTasks: 1,
            completedMinutes: 0,
            totalMinutes: 60,
          },
          tasks: [
            {
              key: 'task-one',
              title: 'Learn JavaScript',
              description: 'Study JavaScript fundamentals.',
              estimatedMinutes: 60,
              difficulty: 'beginner',
              dependencies: [],
              completionCriteria: ['Write a script'],
              type: 'learn',
              state: 'NOT_STARTED',
              resourceStatus: {
                state: 'not_found',
                message: 'No suitable learning resource found.',
              },
              notes: [],
              attachments: [],
            },
          ],
        },
      ],
    },
  ],
};

vi.mock('../features/roadmaps/hooks/use-roadmaps.js', () => ({
  useRoadmap: () => ({ data: { data: { workspace } }, isPending: false, isError: false }),
  useWorkspaceMutation: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  useRoadmapVisibility: () => ({ mutateAsync: mocks.visibilityMutateAsync, isPending: false }),
}));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ isOverviewCollapsed: true });
});

afterEach(() => {
  cleanup();
  mocks.mutateAsync.mockReset();
  mocks.visibilityMutateAsync.mockReset();
});

it('publishes the owner roadmap explicitly from the workspace', async () => {
  mocks.visibilityMutateAsync.mockResolvedValue({
    data: {
      workspace: { ...workspace, visibility: 'PUBLIC', publishedAt: new Date().toISOString() },
    },
  });
  render(
    <MemoryRouter initialEntries={['/roadmaps/d2e4439c-8f14-47dd-9280-a2a3cc1029fd']}>
      <Routes>
        <Route path="/roadmaps/:id" element={<RoadmapWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Publish' }));

  expect(mocks.visibilityMutateAsync).toHaveBeenCalledWith({ visibility: 'PUBLIC', revision: 0 });
  expect(await screen.findByRole('button', { name: 'Make Private' })).toBeInTheDocument();
});

it('renders and expands the complete roadmap hierarchy', async () => {
  render(
    <MemoryRouter initialEntries={['/roadmaps/d2e4439c-8f14-47dd-9280-a2a3cc1029fd']}>
      <Routes>
        <Route path="/roadmaps/:id" element={<RoadmapWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  expect(screen.getByDisplayValue('Foundations')).toBeInTheDocument();
  expect(screen.getByText('Progress Made')).toBeInTheDocument();
  expect(screen.getByText('0 / 1 Tasks')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand roadmap overview' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Expand Week One' }));
  expect(screen.getByDisplayValue('Learn JavaScript')).toBeInTheDocument();
  expect(screen.getByText('No suitable learning resource found.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Expand roadmap overview' }));
  expect(screen.getByText('0% complete')).toBeInTheDocument();
  expect(screen.getByText('Learning Context v2')).toBeInTheDocument();
  expect(screen.getByText('Target role Frontend Engineer')).toBeInTheDocument();
  expect(screen.getByText('example/frontend')).toBeInTheDocument();
});

it('offers task-only attachments and editable private notes', async () => {
  mocks.mutateAsync.mockResolvedValue({ data: { workspace } });
  render(
    <MemoryRouter initialEntries={['/roadmaps/d2e4439c-8f14-47dd-9280-a2a3cc1029fd']}>
      <Routes>
        <Route path="/roadmaps/:id" element={<RoadmapWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Expand Week One' }));
  await user.click(screen.getByRole('button', { name: 'Details for Learn JavaScript' }));

  expect(screen.getByText('Private notes')).toBeInTheDocument();
  expect(screen.getByLabelText('Attachments for Learn JavaScript')).toBeInTheDocument();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Attachment type for Learn JavaScript' }),
    'github',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Attachment URL for Learn JavaScript' }),
    'https://github.com/example/frontend',
  );
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(mocks.mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'updateNode',
      nodeType: 'task',
      changes: {
        attachments: [
          expect.objectContaining({
            type: 'github',
            url: 'https://github.com/example/frontend',
          }),
        ],
      },
    }),
  );
});
