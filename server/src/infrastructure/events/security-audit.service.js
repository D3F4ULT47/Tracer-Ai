import { SecurityAuditEvent } from './security-audit-event.model.js';

export function recordSecurityAudit({
  actorId,
  action,
  targetType = 'user',
  targetId,
  result = 'success',
  requestId,
  metadata = {},
}) {
  return SecurityAuditEvent.create({
    actorId,
    action,
    targetType,
    targetId,
    result,
    requestId,
    metadata,
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
  });
}
