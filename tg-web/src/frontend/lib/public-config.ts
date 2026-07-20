type FetchImplementation = typeof fetch;

type PublicConfig = {
  clerkPublishableKey: string;
};

export async function fetchPublicConfig(
  fetchImplementation: FetchImplementation = fetch,
): Promise<PublicConfig | null> {
  try {
    const response = await fetchImplementation('/api/public-config');
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      data?: { clerkPublishableKey?: unknown };
    };
    const key = body.data?.clerkPublishableKey;
    if (typeof key !== 'string' || !key.trim()) {
      return null;
    }
    return { clerkPublishableKey: key.trim() };
  } catch {
    return null;
  }
}

/** Prefer runtime BFF config; fall back to Vite build-time env for local dev. */
export async function resolveClerkPublishableKey(
  vitePublishableKey?: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<string | null> {
  const runtime = await fetchPublicConfig(fetchImplementation);
  const key = runtime?.clerkPublishableKey || vitePublishableKey?.trim();
  return key || null;
}
