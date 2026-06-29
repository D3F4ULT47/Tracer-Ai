import { handleUserCreated } from '../../modules/users/user-created.handler.js';
import { handleUserDeleted } from '../../modules/users/user-deleted.handler.js';
import { eventHandlerRegistry } from './event-handler-registry.js';

let registered = false;

export function registerEventHandlers() {
  if (registered) return eventHandlerRegistry;
  eventHandlerRegistry.register('user.created', handleUserCreated);
  eventHandlerRegistry.register('user.deleted', handleUserDeleted);
  registered = true;
  return eventHandlerRegistry;
}
