export function Select({ label, id, children, ...props }) {
  return (
    <label className="ui-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} className="ui-input" {...props}>
        {children}
      </select>
    </label>
  );
}
