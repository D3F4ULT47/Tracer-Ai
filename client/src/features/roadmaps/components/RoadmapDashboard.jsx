import { Flame, GaugeCircle, Target, TimerReset } from 'lucide-react';

function formatMinutes(minutes) {
  if (!minutes) return '0m';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function fallbackDashboard(progress) {
  return {
    progressMade: {
      percentage: progress.percentage,
      completedTasks: progress.completedTasks,
      totalTasks: progress.totalTasks,
    },
    learningVelocity: { minutesToday: 0 },
    currentStreak: { days: 0 },
    nextMilestone: { title: 'Next task', remainingMinutes: 0 },
  };
}

function ProgressRing({ percentage }) {
  return (
    <span
      className="dashboard-progress-ring"
      style={{ '--dashboard-progress': `${percentage * 3.6}deg` }}
      aria-label={`${percentage}% complete`}
      role="img"
    >
      <span>{percentage}%</span>
    </span>
  );
}

export function RoadmapDashboard({ dashboard, progress }) {
  const data = dashboard ?? fallbackDashboard(progress);
  const streak = data.currentStreak.days;
  return (
    <section className="roadmap-dashboard" aria-label="Roadmap dashboard">
      <article className="roadmap-dashboard-card roadmap-dashboard-card--progress">
        <ProgressRing percentage={data.progressMade.percentage} />
        <div>
          <span>Progress Made</span>
          <strong>
            {data.progressMade.completedTasks} / {data.progressMade.totalTasks} Tasks
          </strong>
        </div>
      </article>
      <article className="roadmap-dashboard-card">
        <TimerReset size={17} />
        <div>
          <span>Learning Velocity</span>
          <strong>{data.learningVelocity.minutesToday} min/day</strong>
        </div>
      </article>
      <article className="roadmap-dashboard-card">
        {streak > 0 ? <Flame size={17} /> : <GaugeCircle size={17} />}
        <div>
          <span>Current Streak</span>
          <strong>{streak > 0 ? `${streak} Day Streak` : 'Start your streak today'}</strong>
        </div>
      </article>
      <article className="roadmap-dashboard-card roadmap-dashboard-card--milestone">
        <Target size={17} />
        <div>
          <span>Next Milestone</span>
          <strong>{data.nextMilestone.title}</strong>
          <small>{formatMinutes(data.nextMilestone.remainingMinutes)} remaining</small>
        </div>
      </article>
    </section>
  );
}
