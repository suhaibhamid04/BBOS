import { describe, expect, it } from 'bun:test';
import { authorizeResource, resolveQueryScope } from '../../server/authorization/policyEngine';

const media = { resourceId: 'media-1', ownerEmployeeId: 'marketing-1', departmentId: 'MARKETING', status: 'DRAFT' };
const marketing = { employeeId: 'marketing-1', role: 'Marketing', active: true, department: 'MARKETING' };

describe('Marketing media centralized authorization', () => {
  it('allows Marketing to manage owned media but not verify rights', () => {
    for (const action of ['CREATE_MEDIA', 'READ_MEDIA', 'UPDATE_MEDIA_METADATA', 'SUBMIT_MEDIA_RIGHTS', 'CREATE_MEDIA_JOB', 'READ_MEDIA_JOB'] as const) {
      expect(authorizeResource(marketing, 'MEDIA_ASSET', action, media).allowed).toBe(true);
    }
    expect(authorizeResource(marketing, 'MEDIA_ASSET', 'VERIFY_MEDIA_RIGHTS', media).allowed).toBe(false);
  });

  it('fails closed across employee scope and for inactive employees', () => {
    expect(authorizeResource(marketing, 'MEDIA_ASSET', 'READ_MEDIA', { ...media, ownerEmployeeId: 'marketing-2' }).code).toBe('SCOPE_MISMATCH');
    expect(authorizeResource({ ...marketing, active: false }, 'MEDIA_ASSET', 'READ_MEDIA', media).code).toBe('INVALID_PRINCIPAL');
  });

  it('allows Founder/Admin rights verification and denies commercial roles', () => {
    expect(authorizeResource({ employeeId: 'founder-1', role: 'Founder', active: true }, 'MEDIA_ASSET', 'VERIFY_MEDIA_RIGHTS', media).allowed).toBe(true);
    expect(authorizeResource({ employeeId: 'admin-1', role: 'Admin', active: true }, 'MEDIA_ASSET', 'VERIFY_MEDIA_RIGHTS', media).allowed).toBe(true);
    expect(authorizeResource({ employeeId: 'sales-1', role: 'Sales Executive', active: true }, 'MEDIA_ASSET', 'READ_MEDIA', media).allowed).toBe(false);
  });

  it('produces an owner-constrained list descriptor for Marketing', () => {
    expect(resolveQueryScope(marketing, 'MEDIA_ASSET', 'READ_MEDIA')).toMatchObject({
      scope: 'OWN', constraints: [{ field: 'ownerEmployeeId', operator: '==', value: 'marketing-1' }], aggregateOnly: false,
    });
  });
});
