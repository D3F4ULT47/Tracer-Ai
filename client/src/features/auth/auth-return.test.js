import { beforeEach, describe, expect, it } from 'vitest';
import { consumeAuthReturn, peekAuthReturn, rememberAuthReturn } from './auth-return.js';

beforeEach(() => sessionStorage.clear());

describe('authentication return navigation', () => {
  it('preserves the complete local route through authentication', () => {
    rememberAuthReturn({ pathname: '/roadmaps/temporary-1', search: '?week=2', hash: '#task-3' });

    expect(peekAuthReturn()).toBe('/roadmaps/temporary-1?week=2#task-3');
    expect(consumeAuthReturn()).toBe('/roadmaps/temporary-1?week=2#task-3');
    expect(peekAuthReturn()).toBe('/');
  });

  it('rejects external return destinations', () => {
    expect(rememberAuthReturn('https://example.com')).toBe('/');
    expect(rememberAuthReturn('//example.com')).toBe('/');
  });
});
