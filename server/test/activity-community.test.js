import assert from 'node:assert/strict';
import test from 'node:test';
import { createActivityEvent } from '../src/modules/activity/activity-event.js';
import { createActivityService } from '../src/modules/activity/activity.service.js';
import { createCommunityService } from '../src/modules/community/community.service.js';
import { createCommunityRepository } from '../src/modules/community/community.repository.js';

const userId = '507f1f77bcf86cd799439011';
const roadmapId = '11111111-1111-4111-8111-111111111111';

test('activity events contain the complete immutable MVP event shape', () => {
  const event = createActivityEvent({
    userId,
    roadmapId,
    roadmapTitle: 'Frontend Roadmap',
    roadmapVersion: 2,
    activityType: 'TASK_COMPLETED',
    entityType: 'task',
    entityId: 'react-basics',
    shortDescription: 'Completed React basics.',
  });

  assert.match(event.activityId, /^[0-9a-f-]{36}$/);
  assert.equal(event.userId, userId);
  assert.equal(event.ownerId, userId);
  assert.equal(event.activityType, 'TASK_COMPLETED');
  assert.equal(event.timestamp instanceof Date, true);
  assert.equal(Object.isFrozen(event), true);
});

test('recent activity is newest-first, limited, and cursor-ready', async () => {
  const records = [
    {
      activityId: '22222222-2222-4222-8222-222222222222',
      userId,
      roadmapId,
      roadmapTitle: 'Frontend Roadmap',
      activityType: 'TASK_COMPLETED',
      entityType: 'task',
      entityId: 'react-basics',
      shortDescription: 'Completed React basics.',
      timestamp: new Date('2026-07-02T12:00:00.000Z'),
      metadata: {},
    },
    {
      activityId: '33333333-3333-4333-8333-333333333333',
      userId,
      roadmapId,
      roadmapTitle: 'Frontend Roadmap',
      activityType: 'NOTE_ADDED',
      entityType: 'task',
      entityId: 'react-basics',
      shortDescription: 'Added a note.',
      timestamp: new Date('2026-07-02T11:00:00.000Z'),
      metadata: {},
    },
  ];
  let received;
  const service = createActivityService({
    repository: {
      async list(input) {
        received = input;
        return records;
      },
    },
  });

  const result = await service.list(userId, { limit: '1' });
  assert.equal(received.limit, 1);
  assert.equal(result.activities.length, 1);
  assert.equal(result.activities[0].activityType, 'TASK_COMPLETED');
  assert.ok(result.nextCursor);
});

test('activity rejects malformed cursors before repository access', async () => {
  const service = createActivityService({
    repository: {
      async list() {
        throw new Error('should not run');
      },
    },
  });
  await assert.rejects(
    service.list(userId, { cursor: 'not-a-cursor' }),
    (error) => error.code === 'ACTIVITY_CURSOR_INVALID',
  );
});

test('community feed returns repository-provided public roadmaps without ranking metadata', async () => {
  const service = createCommunityService({
    repository: {
      async listNewestPublic(limit) {
        assert.equal(limit, 20);
        return [
          {
            roadmapId,
            title: 'Frontend Roadmap',
            summary: 'A public learning path.',
            type: 'skill',
            difficulty: 'beginner',
            estimatedWeeks: 8,
            creatorName: 'Learner',
            publishedAt: '2026-07-02T12:00:00.000Z',
          },
        ];
      },
    },
  });

  const result = await service.feed();
  assert.equal(result.roadmaps.length, 1);
  assert.deepEqual(Object.keys(result.roadmaps[0]).sort(), [
    'creatorName',
    'difficulty',
    'estimatedWeeks',
    'publishedAt',
    'roadmapId',
    'summary',
    'title',
    'type',
  ]);
});

test('community repository queries only public non-deleted roadmaps newest first', async () => {
  let roadmapFilter;
  let roadmapSort;
  const publicRoadmap = {
    roadmapId,
    ownerId: userId,
    title: 'Public Roadmap',
    summary: 'Visible to the community.',
    type: 'skill',
    difficulty: 'beginner',
    estimatedWeeks: 4,
    publishedAt: new Date('2026-07-02T12:00:00.000Z'),
  };
  const repository = createCommunityRepository({
    RoadmapModel: {
      find(filter) {
        roadmapFilter = filter;
        return {
          sort(sort) {
            roadmapSort = sort;
            return this;
          },
          limit() {
            return this;
          },
          async lean() {
            return [publicRoadmap];
          },
        };
      },
    },
    ProfileModel: {
      find() {
        return {
          select() {
            return this;
          },
          async lean() {
            return [{ userId, name: 'Learner' }];
          },
        };
      },
    },
  });

  const result = await repository.listNewestPublic();
  assert.deepEqual(roadmapFilter, {
    visibility: 'PUBLIC',
    publishedAt: { $ne: null },
    deletedAt: null,
  });
  assert.deepEqual(roadmapSort, { publishedAt: -1, roadmapId: -1 });
  assert.equal(result[0].creatorName, 'Learner');
});
