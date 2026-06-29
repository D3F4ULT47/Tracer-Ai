export function Input({ label, error, id, ...props }) {
  return (
    <label className="ui-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} className="ui-input" aria-invalid={Boolean(error)} {...props} />
      {error ? <span className="ui-field-error">{error}</span> : null}
    </label>
  );
}
