import { google } from 'googleapis';

export function createGoogleClients(googleConfig, refreshTokenOverride = '') {
  const auth = new google.auth.OAuth2(
    googleConfig.clientId,
    googleConfig.clientSecret,
    googleConfig.redirectUri,
  );

  const refreshToken = refreshTokenOverride || googleConfig.refreshToken;
  if (!refreshToken) throw new Error('Missing Google refresh token');

  auth.setCredentials({
    refresh_token: refreshToken,
  });

  return {
    gmail: google.gmail({ version: 'v1', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
  };
}
