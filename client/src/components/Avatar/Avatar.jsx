export function Avatar({ name = 'User' }) {
  return (
    <span className="ui-avatar" aria-label={name}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
