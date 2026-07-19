import type {
  LEGAL_DOCUMENT_VERSIONS,
  LegalDocumentType,
  AccountPreferences,
  AccountProfile,
} from '@/backend/account/contract';

type AccountPayload = {
  profile: AccountProfile;
  legalVersions: typeof LEGAL_DOCUMENT_VERSIONS;
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error('Unable to update account');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const getAccountProfile = () =>
  request<AccountPayload>('/api/account/profile');

export const updateAccountPreferences = (preferences: AccountPreferences) =>
  request<AccountProfile>('/api/account/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });

export const acceptLegalDocuments = (documentTypes: LegalDocumentType[]) =>
  request<AccountProfile>('/api/account/consents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentTypes }),
  });
