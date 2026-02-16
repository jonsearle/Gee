import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';
import { getUserPreferences, setUserPreferences } from './preferences.js';

dotenv.config();

const preferencesFile = process.env.GEE_PREFERENCES_FILE || '.gee-preferences.json';
const webPort = Number(process.env.GEE_WEB_PORT || 8787);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '../web');

const app = express();
app.use(express.json());
app.use(express.static(webDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/preferences', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email query param is required' });

    const prefs = await getUserPreferences(preferencesFile, email);
    return res.json(prefs);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to load preferences' });
  }
});

app.post('/api/preferences', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email is required' });

    const prefs = await setUserPreferences(preferencesFile, email, {
      autoSendDailyEmail: Boolean(req.body?.autoSendDailyEmail),
    });

    return res.json(prefs);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to update preferences' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

app.listen(webPort, () => {
  console.log(`Gee preferences server running on http://localhost:${webPort}`);
});
