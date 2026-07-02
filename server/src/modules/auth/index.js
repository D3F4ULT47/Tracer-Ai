export { identityService } from './identity.service.js';
export { authenticate } from './middlewares/authenticate.js';
export { optionalAuthenticate } from './middlewares/optional-authenticate.js';
export { requireCsrf } from './middlewares/csrf.js';
export { authRouter } from './auth.routes.js';
export const authModule = Object.freeze({ name: 'auth', routePrefix: '/auth' });
