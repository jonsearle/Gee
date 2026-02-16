import { google } from 'googleapis';

export function createGoogleClients(googleConfig) {
  const auth = new google.auth.OAuth2(
    googleConfig.clientId,
    googleConfig.clientSecret,
    googleConfig.redirectUri,
  );

  auth.setCredentials({
    refresh_token: googleConfig.refreshToken,
  });

  return {
    gmail: google.gmail({ version: 'v1', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
  };
}
