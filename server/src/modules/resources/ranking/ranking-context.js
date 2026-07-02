export function fieldValue(field) {
  return field && typeof field === 'object' && 'value' in field ? field.value : field;
}

export function strings(value) {
  const resolved = fieldValue(value);
  if (Array.isArray(resolved)) {
    return resolved
      .map((item) => (typeof item === 'string' ? item : (item?.name ?? item?.value)))
      .filter(Boolean);
  }
  return typeof resolved === 'string' && resolved.trim() ? [resolved] : [];
}

export function text(value) {
  const resolved = fieldValue(value);
  if (typeof resolved === 'string') return resolved.trim();
  if (resolved && typeof resolved === 'object') {
    return resolved.name ?? resolved.title ?? resolved.summary ?? '';
  }
  return '';
}

export function number(value) {
  const resolved = fieldValue(value);
  return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : null;
}

export function tokens(...values) {
  return new Set(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .flatMap((value) =>
        String(value)
          .toLowerCase()
          .split(/[^a-z0-9+#.]+/),
      )
      .filter((value) => value.length > 1),
  );
}
