import { describe, expect, it } from 'vitest';

import { isAuthorizedRequest } from '../src/http/auth';

describe('isAuthorizedRequest', () => {
  it('accepts bearer auth and Slack agent shared-secret headers', () => {
    expect(
      isAuthorizedRequest({ authorization: 'Bearer shared-secret' }, 'shared-secret'),
    ).toBe(true);
    expect(
      isAuthorizedRequest(
        { 'x-slack-agent-shared-secret': 'shared-secret' },
        'shared-secret',
      ),
    ).toBe(true);
  });

  it('rejects missing or mismatched shared secrets', () => {
    expect(isAuthorizedRequest({}, 'shared-secret')).toBe(false);
    expect(
      isAuthorizedRequest({ authorization: 'Bearer wrong-secret' }, 'shared-secret'),
    ).toBe(false);
  });
});
