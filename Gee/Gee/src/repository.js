import { createSupabaseClients } from './supabase.js';
import {
  buildThemeCluster,
  normalizePreferenceThemeKey,
  themeDisplayName,
  uniqueStrings,
} from './theme-domain.js';
import { createEmptyWorkspace, ensureWorkspaceShape } from './workspace.js';

function mustSingle(data, error) {
  if (error) throw error;
  return data || null;
}

function defaultSendDaysUtc() {
  return [0, 1, 2, 3, 4, 5, 6];
}

function normalizeSendDaysUtc(value) {
  const parsed = uniqueStrings(value).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : defaultSendDaysUtc();
}

export function createRepository({ supabaseUrl, supabaseServiceRoleKey }) {
  const db = createSupabaseClients({ url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey });

  return {
    async getUserByEmail(email) {
      const { data, error } = await db
        .from('gee_users')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async getUserById(id) {
      const { data, error } = await db
        .from('gee_users')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async upsertOAuthUser({ email, name, encryptedRefreshToken }) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const existing = await this.getUserByEmail(normalizedEmail);

      const payload = {
        email: normalizedEmail,
        name: name || normalizedEmail,
        updated_at: new Date().toISOString(),
      };

      if (encryptedRefreshToken) payload.google_refresh_token_enc = encryptedRefreshToken;

      if (!existing) {
        payload.auto_send_daily_email = true;
        payload.send_hour_utc = 9;
      }

      const { data, error } = await db
        .from('gee_users')
        .upsert(payload, { onConflict: 'email' })
        .select('*')
        .single();

      return mustSingle(data, error);
    },

    async updateUserPreferences({ userId, autoSendDailyEmail, sendHourUtc }) {
      const payload = {
        updated_at: new Date().toISOString(),
      };

      if (typeof autoSendDailyEmail === 'boolean') payload.auto_send_daily_email = autoSendDailyEmail;
      if (typeof sendHourUtc === 'number') payload.send_hour_utc = sendHourUtc;

      const { data, error } = await db
        .from('gee_users')
        .update(payload)
        .eq('id', userId)
        .select('*')
        .single();

      return mustSingle(data, error);
    },

    async listUsersForHour(hourUtc) {
      const { data, error } = await db
        .from('gee_users')
        .select('*')
        .eq('auto_send_daily_email', true)
        .eq('send_hour_utc', hourUtc);
      if (error) throw error;
      return data || [];
    },

    async claimScheduledSend({ userId, sendDateUtc }) {
      const { error } = await db
        .from('gee_scheduled_sends')
        .insert({
          user_id: userId,
          send_date_utc: sendDateUtc,
        });

      if (!error) return true;
      if (error.code === '23505') return false;
      throw error;
    },

    async releaseScheduledSendClaim({ userId, sendDateUtc }) {
      const { error } = await db
        .from('gee_scheduled_sends')
        .delete()
        .eq('user_id', userId)
        .eq('send_date_utc', sendDateUtc);
      if (error) throw error;
    },

    async getUserState(userId) {
      const { data, error } = await db
        .from('gee_user_state')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async saveUserState(userId, { firstRunCompleted, lastRunAt, lastThreadIds }) {
      const { error } = await db
        .from('gee_user_state')
        .upsert({
          user_id: userId,
          first_run_completed: Boolean(firstRunCompleted),
          last_run_at: lastRunAt,
          last_thread_ids: Array.isArray(lastThreadIds) ? lastThreadIds : [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
    },

    async createDailyRun({ userId, subject, model, planJson }) {
      const { data, error } = await db
        .from('gee_daily_runs')
        .insert({
          user_id: userId,
          subject,
          model,
          plan_json: planJson,
        })
        .select('*')
        .single();
      return mustSingle(data, error);
    },

    async createRunSections(runId, sections = []) {
      if (!Array.isArray(sections) || !sections.length) return [];
      const payload = sections.map((section) => ({
        run_id: runId,
        section_key: String(section.sectionKey || '').trim(),
        title: String(section.title || '').trim(),
        confidence: typeof section.confidence === 'number' ? section.confidence : null,
        evidence_refs: Array.isArray(section.evidenceRefs) ? section.evidenceRefs : [],
        content_json: section.contentJson || {},
      })).filter((row) => row.section_key && row.title);

      if (!payload.length) return [];

      const { data, error } = await db
        .from('gee_run_sections')
        .insert(payload)
        .select('*');
      if (error) throw error;
      return data || [];
    },

    async getDailyRunWithSections({ userId, runId }) {
      const { data: run, error: runError } = await db
        .from('gee_daily_runs')
        .select('*')
        .eq('id', runId)
        .eq('user_id', userId)
        .maybeSingle();
      if (runError) throw runError;
      if (!run) return null;

      const { data: sections, error: sectionsError } = await db
        .from('gee_run_sections')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });
      if (sectionsError) throw sectionsError;

      return {
        run,
        sections: sections || [],
      };
    },

    async createFeedbackEvent({
      userId,
      runId = null,
      sectionId = null,
      feedbackType,
      rating = null,
      comment = '',
      metadata = {},
    }) {
      const { error } = await db
        .from('gee_feedback_events')
        .insert({
          user_id: userId,
          run_id: runId,
          section_id: sectionId,
          feedback_type: feedbackType,
          rating,
          comment: String(comment || '').trim() || null,
          metadata: metadata || {},
        });
      if (error) throw error;
    },

    async getUserPromptPreferences(userId) {
      const { data, error } = await db
        .from('gee_user_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async getUserMasterPreferences(userId) {
      const current = await this.getUserPromptPreferences(userId);
      const planning = current?.planning_constraints || {};
      return {
        sendDaysUtc: normalizeSendDaysUtc(planning.sendDaysUtc),
        moreThemes: uniqueStrings(current?.preferred_sections).map((x) => normalizePreferenceThemeKey(x)).filter(Boolean),
        lessThemes: uniqueStrings(planning.lessThemes).map((x) => normalizePreferenceThemeKey(x)).filter(Boolean),
        hiddenThemes: uniqueStrings(current?.suppressed_sections).map((x) => normalizePreferenceThemeKey(x)).filter(Boolean),
      };
    },

    async getWorkspaceState(userId) {
      const current = await this.getUserPromptPreferences(userId);
      const planning = current?.planning_constraints || {};
      return ensureWorkspaceShape(planning.workspace_v1 || createEmptyWorkspace());
    },

    async saveWorkspaceState(userId, workspaceState) {
      const current = await this.getUserPromptPreferences(userId);
      const planningConstraints = {
        ...(current?.planning_constraints || {}),
        workspace_v1: ensureWorkspaceShape(workspaceState),
      };

      const next = {
        user_id: userId,
        planning_constraints: planningConstraints,
        preferred_sections: current?.preferred_sections || [],
        suppressed_sections: current?.suppressed_sections || [],
        tone_prefs: current?.tone_prefs || {},
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('gee_user_preferences')
        .upsert(next, { onConflict: 'user_id' })
        .select('*')
        .single();

      return mustSingle(data, error);
    },

    async upsertMasterPreferences(userId, { sendDaysUtc, moreThemes, lessThemes, hiddenThemes } = {}) {
      const current = await this.getUserPromptPreferences(userId);
      const planningConstraints = {
        ...(current?.planning_constraints || {}),
      };
      if (sendDaysUtc) planningConstraints.sendDaysUtc = normalizeSendDaysUtc(sendDaysUtc);
      if (lessThemes) planningConstraints.lessThemes = uniqueStrings(lessThemes).map((x) => normalizePreferenceThemeKey(x)).filter(Boolean);

      const next = {
        user_id: userId,
        planning_constraints: planningConstraints,
        preferred_sections: moreThemes
          ? uniqueStrings(moreThemes).map((x) => normalizePreferenceThemeKey(x)).filter(Boolean)
          : (current?.preferred_sections || []),
        suppressed_sections: hiddenThemes
          ? uniqueStrings(hiddenThemes).map((x) => normalizePreferenceThemeKey(x)).filter(Boolean)
          : (current?.suppressed_sections || []),
        tone_prefs: current?.tone_prefs || {},
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('gee_user_preferences')
        .upsert(next, { onConflict: 'user_id' })
        .select('*')
        .single();

      return mustSingle(data, error);
    },

    async setThemePreference(userId, rawTheme, preference) {
      const theme = normalizePreferenceThemeKey(rawTheme);
      if (!theme) throw new Error('Theme is required');

      const current = await this.getUserMasterPreferences(userId);
      const more = new Set(current.moreThemes);
      const less = new Set(current.lessThemes);
      const hidden = new Set(current.hiddenThemes);

      more.delete(theme);
      less.delete(theme);
      hidden.delete(theme);

      if (preference === 'more') more.add(theme);
      if (preference === 'less') less.add(theme);
      if (preference === 'hidden') hidden.add(theme);

      await this.upsertMasterPreferences(userId, {
        moreThemes: [...more],
        lessThemes: [...less],
        hiddenThemes: [...hidden],
      });

      return {
        theme,
        preference,
      };
    },

    async getRecentThemesForUser(userId, limit = 30) {
      const objects = await this.getRecentThemeObjectsForUser(userId, limit, 12);
      return objects.map((x) => x.key);
    },

    async getRecentThemeObjectsForUser(userId, limit = 30, maxThemes = 8) {
      const { data, error } = await db
        .from('gee_daily_runs')
        .select('plan_json,sent_at')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const candidates = [];
      for (const row of data || []) {
        const sentAt = row?.sent_at || '';
        const focusThemes = Array.isArray(row?.plan_json?.focusThemes)
          ? row.plan_json.focusThemes
          : [];
        const mainThings = Array.isArray(row?.plan_json?.mainThings)
          ? row.plan_json.mainThings
          : [];
        const candidateThemes = Array.isArray(row?.plan_json?.candidateThemes)
          ? row.plan_json.candidateThemes
          : [];

        for (const focus of focusThemes) {
          candidates.push({
            name: String(focus?.name || ''),
            summary: String(focus?.summary || ''),
            raw: String(focus?.name || ''),
            lastSeenAt: sentAt,
          });
        }

        for (const item of mainThings) {
          candidates.push({
            name: String(item?.themeLabel || item?.theme || ''),
            summary: '',
            raw: String(item?.themeLabel || item?.theme || ''),
            lastSeenAt: sentAt,
          });
        }
        for (const theme of candidateThemes) {
          candidates.push({
            name: String(theme || ''),
            summary: '',
            raw: String(theme || ''),
            lastSeenAt: sentAt,
          });
        }
      }

      return buildThemeCluster(candidates, maxThemes).map((x) => ({
        ...x,
        name: themeDisplayName(x.key),
      }));
    },

    async upsertUserPromptPreferences(userId, updates = {}) {
      const current = await this.getUserPromptPreferences(userId);
      const next = {
        user_id: userId,
        planning_constraints: updates.planningConstraints ?? current?.planning_constraints ?? {},
        preferred_sections: updates.preferredSections ?? current?.preferred_sections ?? [],
        suppressed_sections: updates.suppressedSections ?? current?.suppressed_sections ?? [],
        tone_prefs: updates.tonePrefs ?? current?.tone_prefs ?? {},
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('gee_user_preferences')
        .upsert(next, { onConflict: 'user_id' })
        .select('*')
        .single();

      return mustSingle(data, error);
    },
  };
}
