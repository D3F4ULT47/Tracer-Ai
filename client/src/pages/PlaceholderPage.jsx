export function PlaceholderPage({ title, description }) {
  return (
    <section className="page">
      <p className="eyebrow">Tracer AI</p>
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
      <div className="placeholder-card">
        This module is scaffolded and ready for implementation.
      </div>
    </section>
  );
}
