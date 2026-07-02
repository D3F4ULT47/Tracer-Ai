import { Component } from 'react';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('Tracer AI interface error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error-page">
        <div>
          <p className="eyebrow">Your work is still safe</p>
          <h1>This screen couldn’t finish loading</h1>
          <p>
            Tracer AI hit an unexpected interface problem. Reload the screen or return home to
            continue from your saved work.
          </p>
          <div className="fatal-error-actions">
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => window.location.reload()}
            >
              Reload screen
            </button>
            <a className="ui-button" href="/">
              Return home
            </a>
          </div>
        </div>
      </main>
    );
  }
}
