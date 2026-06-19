import { Configuration, LogLevel } from '@azure/msal-browser'

export const msalConfig: Configuration = {
  auth: {
    clientId:    import.meta.env.VITE_ENTRA_CLIENT_ID as string,
    authority:   `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error('[MSAL]', message)
      },
    },
  },
}

// The API scope defined in your Entra External ID app registration
export const loginRequest = {
  scopes: [`api://${import.meta.env.VITE_ENTRA_CLIENT_ID}/access_as_user`],
}
