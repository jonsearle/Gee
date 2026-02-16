import { createSupabaseClients } from './supabase.js';

function mustSingle(data, error) {
  if (error) throw error;
  return data || null;
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
  };
}
