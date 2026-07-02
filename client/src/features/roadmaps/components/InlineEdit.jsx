import { useEffect, useRef, useState } from 'react';

export function InlineEdit({
  value,
  onCommit,
  label,
  multiline = false,
  debounceMs = 0,
  className = '',
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);
  const lastCommitted = useRef(value);

  useEffect(() => () => clearTimeout(timer.current), []);

  function publish(next) {
    if (next && next !== lastCommitted.current) {
      lastCommitted.current = next;
      onCommit(next);
    }
  }

  function commit() {
    clearTimeout(timer.current);
    timer.current = null;
    publish(draft.trim());
  }

  function change(event) {
    const next = event.target.value;
    setDraft(next);
    if (debounceMs) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        publish(next.trim());
      }, debounceMs);
    }
  }

  const shared = {
    className: `workspace-inline-edit ${className}`.trim(),
    'aria-label': label,
    value: draft,
    onChange: change,
    onBlur: commit,
  };
  if (multiline) return <textarea {...shared} rows="3" />;
  return (
    <input
      {...shared}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
