import { randomBytes } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import { env } from '../server/src/config/env.js';
import { connectMongo, disconnectMongo } from '../server/src/infrastructure/database/mongo.js';
import { OutboxEvent } from '../server/src/infrastructure/events/outbox-event.model.js';
import { SecurityAuditEvent } from '../server/src/infrastructure/events/security-audit-event.model.js';
import { AccountToken } from '../server/src/modules/auth/models/account-token.model.js';
import { AuthSession } from '../server/src/modules/auth/models/auth-session.model.js';
import { User } from '../server/src/modules/auth/models/user.model.js';
import { handleUserCreated } from '../server/src/modules/users/user-created.handler.js';
import { LearningProfile } from '../server/src/modules/users/learning-profile/learning-profile.model.js';
import { Profile } from '../server/src/modules/users/profile/profile.model.js';

const apiBaseUrl = 'http://localhost:4000/api/v1';
const email = `runtime-check-${Date.now()}@example.com`;
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const cookies = new Map();
const verifyCloudinary = process.env.ENABLE_LIVE_TESTS === 'true';
let userId;

function createPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

function updateCookies(response) {
  for (const value of response.headers.getSetCookie()) {
    const [pair, ...attributes] = value.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const cookieValue = pair.slice(separator + 1);
    const expired = attributes.some((attribute) => /^\s*Max-Age=0$/i.test(attribute));
    if (expired || cookieValue === '') cookies.delete(name);
    else cookies.set(name, cookieValue);
  }
}

async function request(path, { method = 'GET', body, csrfToken } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookies.size
        ? { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }
        : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  updateCookies(response);
  const payload = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${path} failed (${response.status}): ${payload.message}`);
  return payload;
}

async function requestResume(csrfToken) {
  const form = new FormData();
  form.set(
    'resume',
    new Blob([createPdf('React developer internship and SQL dashboard project')], {
      type: 'application/pdf',
    }),
    'runtime-resume.pdf',
  );
  const response = await fetch(`${apiBaseUrl}/ai/inputs/resume`, {
    method: 'POST',
    headers: {
      cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      'x-csrf-token': csrfToken,
    },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`POST /ai/inputs/resume failed (${response.status}): ${payload.message}`);
  }
  return payload;
}

async function temporaryAssetIds() {
  const result = await cloudinary.api.resources({
    resource_type: 'raw',
    type: 'authenticated',
    prefix: env.CLOUDINARY_TEMP_FOLDER,
    max_results: 500,
  });
  return new Set(result.resources.map((resource) => resource.public_id));
}

async function verifyUnverifiedLoginIsRejected(csrfToken) {
  await User.updateOne({ _id: userId }, { $unset: { emailVerifiedAt: 1 } });
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  return response.status === 403 && payload.error?.code === 'EMAIL_NOT_VERIFIED';
}

async function cleanup() {
  if (!userId) return;
  const objectId = new mongoose.Types.ObjectId(userId);
  await Promise.all([
    AccountToken.deleteMany({ userId: objectId }),
    AuthSession.deleteMany({ userId: objectId }),
    LearningProfile.deleteMany({ userId: objectId }),
    Profile.deleteMany({ userId: objectId }),
    OutboxEvent.deleteMany({ aggregateId: userId }),
    SecurityAuditEvent.deleteMany({
      $or: [{ actorId: objectId }, { targetId: userId }],
    }),
  ]);
  await User.deleteOne({ _id: objectId });
}

try {
  const csrf = await request('/auth/csrf');
  const csrfToken = csrf.data.csrfToken;
  const registration = await request('/auth/register', {
    method: 'POST',
    csrfToken,
    body: { email, password, name: 'Runtime Verification' },
  });
  userId = registration.data.user.id;

  await connectMongo();
  await handleUserCreated({ payload: { userId, name: 'Runtime Verification' } });

  const login = await request('/auth/login', {
    method: 'POST',
    csrfToken,
    body: { email, password },
  });
  const currentUser = await request('/users/me');
  const profile = await request('/users/me/profile');
  let resumeEndpoint = null;
  let temporaryCleanup = null;
  if (verifyCloudinary) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    const beforeAssets = await temporaryAssetIds();
    const resume = await requestResume(csrfToken);
    const afterAssets = await temporaryAssetIds();
    resumeEndpoint =
      resume.data.ingestion.inputType === 'resume' &&
      resume.data.ingestion.metadata.pageCount === 1;
    temporaryCleanup =
      beforeAssets.size === afterAssets.size &&
      [...beforeAssets].every((publicId) => afterAssets.has(publicId));
  }
  const persistedUser = await User.findById(userId).lean();
  const persistedSession = await AuthSession.findOne({ userId }).lean();

  await request('/auth/logout', { method: 'POST', csrfToken });
  const revokedSession = await AuthSession.findById(persistedSession._id).lean();
  const emailVerificationEnforced = await verifyUnverifiedLoginIsRejected(csrfToken);

  console.log(
    JSON.stringify({
      registration: registration.data.user.emailVerified,
      login: login.data.user.id === userId,
      cookies: cookies.has('tracer_access') === false && cookies.has('tracer_refresh') === false,
      protectedRoute: currentUser.data.user.id === userId,
      profile: profile.data.profile.userId === userId,
      mongoPersistence: Boolean(persistedUser && persistedSession),
      logout: Boolean(revokedSession.revokedAt),
      emailVerificationEnforced,
      resumeEndpoint,
      temporaryCleanup,
    }),
  );
} finally {
  if (mongoose.connection.readyState === 0) await connectMongo();
  await cleanup();
  await disconnectMongo();
}
