export function HomePage() {
  return (
    <section className="home-page">
      <div className="hero">
        <p className="eyebrow">AI-native learning operating system</p>
        <h1>What do you want to learn?</h1>
        <div className="goal-input" aria-label="Goal input placeholder">
          Describe a career, skill, project, or interview goal…
        </div>
        <button type="button" className="primary-button">
          Create Personalized Roadmap
        </button>
      </div>
      <section className="recent-section">
        <h2>Recent roadmaps</h2>
        <div className="placeholder-card">Your recent roadmaps will appear here.</div>
      </section>
    </section>
  );
}
