interface ApiErrorPayload {
  error?: string
}

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  const payload = await response.json().catch(() => null) as T | ApiErrorPayload | null

  if (!response.ok) {
    throw new Error(
      (payload as ApiErrorPayload | null)?.error ||
      `Request failed with status ${response.status}`
    )
  }

  return payload as T
}
