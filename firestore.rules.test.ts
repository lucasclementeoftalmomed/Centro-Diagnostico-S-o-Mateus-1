/**
 * Security Rules Verification Suite — Dirty Dozen Payload Tests
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated create on exam_records',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'create',
    auth: null,
    payload: { ownerId: 'user_1', pacienteNome: 'NEIDE RIBEIRO DA SILVA' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email spoof attack on exam_records',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'lucas.clemente@clinicaoftalmomed.com.br', email_verified: false },
    payload: { ownerId: 'user_1', pacienteNome: 'NEIDE RIBEIRO DA SILVA' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity spoofing on create (mismatched ownerId)',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_2', pacienteNome: 'NEIDE RIBEIRO DA SILVA' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow field injection on create',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_1', isVerifiedAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field injection on update',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_1', ghostField: 'injected' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Owner hijack on update',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_2' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Timestamp forgery on create',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable createdAt tampering on update',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '2026-10-09T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Oversized string payload (pacienteNome > 120 chars)',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_1', pacienteNome: 'A'.repeat(250) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid date pattern on dataRealizado',
    collection: 'exam_records',
    docId: 'rec_01',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { ownerId: 'user_1', dataRealizado: '08-10-2026' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Cross-tenant PII read on exam_records',
    collection: 'exam_records',
    docId: 'rec_user1_doc',
    operation: 'get',
    auth: { uid: 'user_2', email: 'user2@clinicaoftalmomed.com.br', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Self-assigned admin privilege escalation',
    collection: 'admins',
    docId: 'user_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@clinicaoftalmomed.com.br', email_verified: true },
    payload: { email: 'user1@clinicaoftalmomed.com.br' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
