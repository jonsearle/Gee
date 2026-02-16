import { google } from 'googleapis';
import { getAppEnv } from '../../src/netlify/env.js';
import { redirect } from '../../src/netlify/http.js';

export const handler = async () => {
  try {
    const appEnv = getAppEnv();
    const oauth2Client = new google.auth.OAuth2(
      appEnv.google.clientId,
      appEnv.google.clientSecret,
      appEnv.google.redirectUri,
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
    });

    return redirect(url);
  } catch (err) {
    return {
      statusCode: 500,
      body: `Failed to start OAuth: ${err.message || 'unknown error'}`,
    };
  }
};
