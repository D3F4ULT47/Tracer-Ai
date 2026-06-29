import mongoose from 'mongoose';

const securityAuditEventSchema = new mongoose.Schema(
  {
    actorId: mongoose.Schema.Types.ObjectId,
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: String,
    result: { type: String, enum: ['success', 'failure'], required: true },
    requestId: String,
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'security_audit_events' },
);

securityAuditEventSchema.index({ actorId: 1, createdAt: -1 });
securityAuditEventSchema.index({ action: 1, createdAt: -1 });
securityAuditEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SecurityAuditEvent =
  mongoose.models.SecurityAuditEvent ??
  mongoose.model('SecurityAuditEvent', securityAuditEventSchema);
