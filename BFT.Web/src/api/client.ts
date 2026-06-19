import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'
import { loginRequest } from '../auth/msalConfig'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? ''

/** Acquire a token silently and call BFT.Api with the correct Authorization header. */
export async function apiRequest<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const { accessToken } = await msal.acquireTokenSilent({ ...loginRequest, account })

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`BFT.Api ${res.status}: ${detail}`)
  }

  return res.json() as Promise<T>
}
