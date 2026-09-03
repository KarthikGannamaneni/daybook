import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { localDate } from '../_shared/format.ts';
import type {
  EntryDraft,
  InboundMessage,
  LinkedIdentity,
  PeriodSummary,
  SavedEntry,
  WebhookDeps,
} from './types.ts';

const GRAPH_VERSION = 'v21.0';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Posts the reply to Meta, or logs it locally when MOCK_WHATSAPP=1 (§10.3). */
async function deliverToMeta(to: string, body: string): Promise<void> {
  if (Deno.env.get('MOCK_WHATSAPP') === '1') return;
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberId || !token) {
    console.error('whatsapp-send: missing credentials, dropping reply');
    return;
  }
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: false } }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) console.error('whatsapp-send failed', res.status, await res.text());
}

/** Best-effort attachment import. Never allowed to delay the 200 past Meta's 2s budget. */
async function importMedia(
  db: SupabaseClient,
  mediaId: string,
  businessId: string,
  entryId: string,
): Promise<string | null> {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  if (!token || Deno.env.get('MOCK_WHATSAPP') === '1') return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500),
    }).then((r) => r.json());
    if (!meta?.url) return null;
    const file = await fetch(meta.url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500),
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${businessId}/${entryId}.jpg`;
    const { error } = await db.storage.from('attachments').upload(path, bytes, {
      contentType: meta.mime_type ?? 'image/jpeg',
      upsert: true,
    });
    return error ? null : path;
  } catch (err) {
    console.error('media import failed', err);
    return null;
  }
}

export function createDeps(db: SupabaseClient): WebhookDeps {
  return {
    async hasProcessed(waMessageId) {
      const { data } = await db
        .from('whatsapp_messages')
        .select('id')
        .eq('wa_message_id', waMessageId)
        .eq('direction', 'in')
        .maybeSingle();
      return Boolean(data);
    },

    async recordInbound(message: InboundMessage, parseResult, businessId) {
      await db.from('whatsapp_messages').upsert(
        {
          wa_message_id: message.waMessageId,
          business_id: businessId,
          phone_e164: message.from.startsWith('+') ? message.from : `+${message.from}`,
          direction: 'in',
          body: message.text,
          media_id: message.mediaId,
          parse_result: parseResult as Record<string, unknown>,
          received_at: message.timestamp.toISOString(),
        },
        { onConflict: 'wa_message_id', ignoreDuplicates: true },
      );
    },

    async attachEntry(waMessageId, entryId) {
      await db.from('whatsapp_messages').update({ entry_id: entryId }).eq('wa_message_id', waMessageId);
    },

    async findLink(phoneE164): Promise<LinkedIdentity | null> {
      const { data } = await db
        .from('whatsapp_links')
        .select('business_id, user_id, businesses!inner(currency, locale, timezone)')
        .eq('phone_e164', phoneE164)
        .maybeSingle();
      if (!data) return null;
      const biz = (data as any).businesses;
      return {
        businessId: (data as any).business_id,
        userId: (data as any).user_id,
        currency: biz?.currency ?? 'INR',
        locale: biz?.locale ?? 'en-IN',
        timezone: biz?.timezone ?? 'Asia/Kolkata',
      };
    },

    async consumeLinkCode(code, phoneE164): Promise<LinkedIdentity | null> {
      const { data } = await db
        .from('whatsapp_link_codes')
        .select('id, business_id, user_id, businesses!inner(currency, locale, timezone)')
        .eq('code', code)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (!data) return null;

      await db.from('whatsapp_link_codes').update({ consumed_at: new Date().toISOString() }).eq('id', (data as any).id);
      const { error } = await db.from('whatsapp_links').upsert(
        { business_id: (data as any).business_id, user_id: (data as any).user_id, phone_e164: phoneE164 },
        { onConflict: 'phone_e164' },
      );
      if (error) return null;

      const biz = (data as any).businesses;
      return {
        businessId: (data as any).business_id,
        userId: (data as any).user_id,
        currency: biz?.currency ?? 'INR',
        locale: biz?.locale ?? 'en-IN',
        timezone: biz?.timezone ?? 'Asia/Kolkata',
      };
    },

    async saveEntry(draft: EntryDraft): Promise<SavedEntry> {
      const { data: accounts } = await db
        .from('accounts')
        .select('id, name, kind')
        .eq('business_id', draft.businessId)
        .eq('is_archived', false)
        .order('sort_order');

      const list = accounts ?? [];
      const byKind = draft.accountKind ? list.find((a) => a.kind === draft.accountKind) : undefined;
      const { data: defaultAccountId } = await db.rpc('fn_default_account', { p_business_id: draft.businessId });
      const account = byKind ?? list.find((a) => a.id === defaultAccountId) ?? list[0];
      if (!account) throw new Error('business has no usable account');

      let categoryId: string | null = null;
      let categoryName: string | null = null;
      if (draft.categoryName) {
        const { data: cat } = await db
          .from('categories')
          .select('id, name')
          .eq('business_id', draft.businessId)
          .eq('type', draft.type)
          .eq('name', draft.categoryName)
          .maybeSingle();
        if (cat) {
          categoryId = cat.id;
          categoryName = cat.name;
        }
      }
      if (!categoryId) {
        // Fall back to what this business's own history predicts (§4.3).
        const { data: predicted } = await db.rpc('fn_predict_category', {
          p_business_id: draft.businessId,
          p_note: draft.note,
          p_party_id: null,
        });
        if (predicted) {
          const { data: cat } = await db.from('categories').select('id, name').eq('id', predicted).maybeSingle();
          if (cat) {
            categoryId = cat.id;
            categoryName = cat.name;
          }
        }
      }

      let partyId: string | null = null;
      if (draft.partyName) {
        const { data } = await db.rpc('fn_upsert_party', {
          p_business_id: draft.businessId,
          p_name: draft.partyName,
        });
        partyId = (data as string | null) ?? null;
      }

      const { data: entry, error } = await db
        .from('entries')
        .insert({
          business_id: draft.businessId,
          type: draft.type,
          amount_minor: draft.amountMinor,
          account_id: account.id,
          category_id: categoryId,
          party_id: partyId,
          note: draft.note || null,
          occurred_at: draft.occurredAt ?? new Date().toISOString(),
          source: 'whatsapp',
          created_by: draft.userId,
        })
        .select('id')
        .single();
      if (error || !entry) throw new Error(`entry insert failed: ${error?.message}`);

      if (draft.mediaId) {
        const path = await importMedia(db, draft.mediaId, draft.businessId, entry.id);
        if (path) await db.from('entries').update({ attachment_path: path }).eq('id', entry.id);
      }

      const { data: business } = await db
        .from('businesses')
        .select('timezone')
        .eq('id', draft.businessId)
        .single();
      const { data: totals } = await db
        .from('v_daily_totals')
        .select('income_minor, expense_minor')
        .eq('business_id', draft.businessId)
        .eq('day', localDate(new Date(), business?.timezone ?? 'Asia/Kolkata'))
        .maybeSingle();

      return {
        id: entry.id,
        amountMinor: draft.amountMinor,
        type: draft.type,
        categoryName,
        accountName: account.name,
        todayTotalMinor:
          String((draft.type === 'income' ? totals?.income_minor : totals?.expense_minor) ?? draft.amountMinor),
      };
    },

    async undoLastEntry(identity, withinMs) {
      const since = new Date(Date.now() - withinMs).toISOString();
      const { data } = await db
        .from('entries')
        .select('id, amount_minor')
        .eq('business_id', identity.businessId)
        .eq('created_by', identity.userId)
        .eq('source', 'whatsapp')
        .is('deleted_at', null)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      await db.from('entries').update({ deleted_at: new Date().toISOString() }).eq('id', data.id);
      return { amountMinor: String(data.amount_minor) };
    },

    async summary(identity, period): Promise<PeriodSummary> {
      if (period === 'month') {
        const { data } = await db.rpc('fn_month_summary', {
          p_business_id: identity.businessId,
          p_month: localDate(new Date(), identity.timezone),
        });
        const row = Array.isArray(data) ? data[0] : data;
        return {
          incomeMinor: String(row?.income_minor ?? 0),
          expenseMinor: String(row?.expense_minor ?? 0),
          netMinor: String(row?.net_minor ?? 0),
          entryCount: Number(row?.entry_count ?? 0),
        };
      }
      const { data } = await db
        .from('v_daily_totals')
        .select('income_minor, expense_minor, net_minor, entry_count')
        .eq('business_id', identity.businessId)
        .eq('day', localDate(new Date(), identity.timezone))
        .maybeSingle();
      return {
        incomeMinor: String(data?.income_minor ?? 0),
        expenseMinor: String(data?.expense_minor ?? 0),
        netMinor: String(data?.net_minor ?? 0),
        entryCount: Number(data?.entry_count ?? 0),
      };
    },

    async sendReply(to, body, businessId) {
      await db.from('whatsapp_messages').insert({
        business_id: businessId,
        phone_e164: to,
        direction: 'out',
        body,
      });
      await deliverToMeta(to, body);
    },
  };
}
