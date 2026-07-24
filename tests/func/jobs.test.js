const { validateTransition } = require('../../src/func/jobs');

describe('validateTransition', () => {
  test('allows the user to submit a draft', () => {
    expect(validateTransition('draft', 'submitted', 'user')).toEqual({ ok: true });
  });

  test('rejects the shop submitting a draft', () => {
    const result = validateTransition('draft', 'submitted', 'shop');
    expect(result).toMatchObject({ ok: false, code: 403 });
  });

  test('allows the shop to queue a submitted job', () => {
    expect(validateTransition('submitted', 'queued', 'shop')).toEqual({ ok: true });
  });

  test('allows either role to cancel a submitted job', () => {
    expect(validateTransition('submitted', 'cancelled', 'user')).toEqual({ ok: true });
    expect(validateTransition('submitted', 'cancelled', 'shop')).toEqual({ ok: true });
  });

  test('rejects an unknown target status', () => {
    const result = validateTransition('submitted', 'printing', 'shop');
    expect(result).toMatchObject({ ok: false, code: 409, message: expect.stringMatching(/Cannot transition/) });
  });

  test('rejects transitions out of a terminal state', () => {
    const result = validateTransition('completed', 'printing', 'shop');
    expect(result).toMatchObject({ ok: false, code: 409, message: expect.stringMatching(/terminal state/) });
  });

  test('allows the shop to move printing to completed', () => {
    expect(validateTransition('printing', 'completed', 'shop')).toEqual({ ok: true });
  });
});
