export function Loader({ label = 'Loading' }) {
  return (
    <div className="ui-loader" role="status">
      <span aria-hidden="true" />
      {label}
    </div>
  );
}
