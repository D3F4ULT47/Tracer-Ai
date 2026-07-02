import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { emailService } from '../../infrastructure/email/email.service.js';
import { appendOutboxEvent } from '../../infrastructure/events/outbox.service.js';
import { recordSecurityAudit } from '../../infrastructure/events/security-audit.service.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { AppError } from '../../shared/app-error.js';
import { passwordService } from './password.service.js';
import { tokenService } from './token.service.js';
import { AccountToken } from './models/account-token.model.js';
import { AuthSession } from './models/auth-session.model.js';
import { User } from './models/user.model.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function issueAccountToken(userId, type, ttl, session) {
  const value = tokenService.randomToken();
  await AccountToken.create(
    [{ userId, type, tokenHash: tokenService.hash(value), expiresAt: new Date(Date.now() + ttl) }],
    session ? { session } : undefined,
  );
  return value;
}

async function createSession(user, context, familyId) {
  const refresh = tokenService.createRefreshToken();
  if (familyId) refresh.familyId = familyId;
  const session = await AuthSession.create({
    userId: user._id,
    familyId: refresh.familyId,
    tokenHash: refresh.hash,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    lastUsedAt: new Date(),
    expiresAt: refresh.expiresAt,
  });
  return {
    accessToken: tokenService.createAccessToken({ userId: user._id, sessionId: session._id }),
    refreshToken: refresh.value,
    session,
  };
}

export const authService = Object.freeze({
  async register({ email, password, name }, context = {}) {
    const normalizedEmail = normalizeEmail(email);
    const transaction = await mongoose.startSession();
    let user;
    let verificationToken;
    try {
      await transaction.withTransaction(async () => {
        if (await User.exists({ email: normalizedEmail }).session(transaction)) {
          throw new AppError('An account with this email already exists', {
            status: 409,
            code: 'EMAIL_IN_USE',
          });
        }
        [user] = await User.create(
          [
            {
              email: normalizedEmail,
              passwordHash: await passwordService.hash(password),
              ...(env.DEV_AUTO_VERIFY_EMAIL ? { emailVerifiedAt: new Date() } : {}),
            },
          ],
          { session: transaction },
        );
        if (!env.DEV_AUTO_VERIFY_EMAIL) {
          verificationToken = await issueAccountToken(
            user._id,
            'email_verification',
            VERIFY_TTL_MS,
            transaction,
          );
        }
        await appendOutboxEvent(
          {
            name: 'user.created',
            aggregateId: String(user._id),
            aggregateType: 'user',
            correlationId: context.requestId,
            payload: { userId: String(user._id), name },
          },
          transaction,
        );
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError('An account with this email already exists', {
          status: 409,
          code: 'EMAIL_IN_USE',
        });
      }
      throw error;
    } finally {
      await transaction.endSession();
    }
    if (verificationToken) {
      try {
        await emailService.sendVerification({ email: normalizedEmail, token: verificationToken });
      } catch (error) {
        logger.error(
          { err: error, userId: String(user._id) },
          'Verification email delivery failed',
        );
      }
    }
    await recordSecurityAudit({
      actorId: user._id,
      action: 'account.registered',
      targetId: String(user._id),
      requestId: context.requestId,
    });
    return this.sanitizeUser(user);
  },

  async login({ email, password }, context = {}) {
    const user = await User.findOne({ email: normalizeEmail(email) }).select('+passwordHash');
    if (!user?.passwordHash || !(await passwordService.verify(user.passwordHash, password))) {
      throw new AppError('Invalid email or password', { status: 401, code: 'INVALID_CREDENTIALS' });
    }
    if (user.status !== 'active') {
      throw new AppError('Account is unavailable', { status: 403, code: 'ACCOUNT_UNAVAILABLE' });
    }
    if (!user.emailVerifiedAt) {
      throw new AppError('Verify your email before signing in', {
        status: 403,
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    const tokens = await createSession(user, context);
    await recordSecurityAudit({
      actorId: user._id,
      action: 'session.created',
      targetType: 'session',
      targetId: String(tokens.session._id),
      requestId: context.requestId,
    });
    return { user: this.sanitizeUser(user), ...tokens };
  },

  async refresh(refreshValue, context = {}) {
    if (!refreshValue)
      throw new AppError('Refresh token required', { status: 401, code: 'REFRESH_REQUIRED' });
    const tokenHash = tokenService.hash(refreshValue);
    const existing = await AuthSession.findOneAndUpdate(
      { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
      { revokedAt: new Date(), revokeReason: 'rotated' },
      { new: false },
    );
    if (!existing) {
      const reused = await AuthSession.findOne({ tokenHash }).lean();
      if (reused) {
        await AuthSession.updateMany(
          { familyId: reused.familyId, revokedAt: null },
          { revokedAt: new Date(), revokeReason: 'refresh_token_reuse' },
        );
      }
      throw new AppError('Refresh session is invalid', {
        status: 401,
        code: reused ? 'REFRESH_REUSE_DETECTED' : 'INVALID_REFRESH',
      });
    }
    const user = await User.findById(existing.userId);
    if (!user || user.status !== 'active')
      throw new AppError('Account is unavailable', { status: 401, code: 'ACCOUNT_UNAVAILABLE' });
    const tokens = await createSession(user, context, existing.familyId);
    return { user: this.sanitizeUser(user), ...tokens };
  },

  async verifyEmail(value) {
    const record = await AccountToken.findOneAndUpdate(
      {
        tokenHash: tokenService.hash(value),
        type: 'email_verification',
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { usedAt: new Date() },
      { new: false },
    );
    if (!record)
      throw new AppError('Verification link is invalid or expired', { code: 'INVALID_TOKEN' });
    await User.updateOne({ _id: record.userId }, { emailVerifiedAt: new Date() });
  },

  async resendVerification(email) {
    const user = await User.findOne({ email: normalizeEmail(email), emailVerifiedAt: null });
    if (!user) return;
    await AccountToken.updateMany(
      { userId: user._id, type: 'email_verification', usedAt: null },
      { usedAt: new Date() },
    );
    const value = await issueAccountToken(user._id, 'email_verification', VERIFY_TTL_MS);
    await emailService.sendVerification({ email: user.email, token: value });
  },

  async requestPasswordReset(email) {
    const user = await User.findOne({ email: normalizeEmail(email), status: 'active' });
    if (!user) return;
    await AccountToken.updateMany(
      { userId: user._id, type: 'password_reset', usedAt: null },
      { usedAt: new Date() },
    );
    const value = await issueAccountToken(user._id, 'password_reset', RESET_TTL_MS);
    await emailService.sendPasswordReset({ email: user.email, token: value });
  },

  async resetPassword(value, password) {
    const record = await AccountToken.findOneAndUpdate(
      {
        tokenHash: tokenService.hash(value),
        type: 'password_reset',
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { usedAt: new Date() },
      { new: false },
    );
    if (!record) throw new AppError('Reset link is invalid or expired', { code: 'INVALID_TOKEN' });
    const passwordHash = await passwordService.hash(password);
    await Promise.all([
      User.updateOne({ _id: record.userId }, { passwordHash }),
      AuthSession.updateMany(
        { userId: record.userId, revokedAt: null },
        { revokedAt: new Date(), revokeReason: 'password_reset' },
      ),
    ]);
  },

  async logout(sessionId) {
    await AuthSession.updateOne(
      { _id: sessionId, revokedAt: null },
      { revokedAt: new Date(), revokeReason: 'logout' },
    );
    await recordSecurityAudit({
      action: 'session.revoked',
      targetType: 'session',
      targetId: String(sessionId),
    });
  },
  async logoutAll(userId) {
    await AuthSession.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date(), revokeReason: 'logout_all' },
    );
  },
  listSessions(userId) {
    return AuthSession.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select('userAgent ipAddress lastUsedAt createdAt expiresAt')
      .sort({ lastUsedAt: -1 })
      .lean();
  },
  revokeSession(userId, sessionId) {
    return AuthSession.updateOne(
      { _id: sessionId, userId, revokedAt: null },
      { revokedAt: new Date(), revokeReason: 'user_revoked' },
    );
  },
  sanitizeUser(user) {
    return {
      id: String(user._id),
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      status: user.status,
      connectedAccounts: user.oauthIdentities.map(({ provider }) => provider),
    };
  },
  async authenticateOAuth(identity, context = {}) {
    let user = await User.findOne({
      oauthIdentities: { $elemMatch: { provider: identity.provider, subject: identity.subject } },
    });
    if (!user) {
      const sameEmail = await User.findOne({ email: identity.email });
      if (sameEmail && !sameEmail.emailVerifiedAt) {
        throw new AppError('Sign in first to connect this account', {
          status: 409,
          code: 'EXPLICIT_LINK_REQUIRED',
        });
      }
      if (sameEmail) {
        sameEmail.oauthIdentities.push(identity);
        await sameEmail.save();
        user = sameEmail;
      } else {
        user = await User.create({
          email: identity.email,
          emailVerifiedAt: new Date(),
          oauthIdentities: [identity],
        });
        await appendOutboxEvent({
          name: 'user.created',
          aggregateId: String(user._id),
          aggregateType: 'user',
          correlationId: context.requestId,
          payload: { userId: String(user._id), name: identity.name },
        });
      }
    }
    const tokens = await createSession(user, context);
    return { user: this.sanitizeUser(user), ...tokens };
  },
});
