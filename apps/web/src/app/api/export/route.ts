import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { entriesToCsv, exportRangeSchema, type EntryView } from '@khata/shared';

export const dynamic = 'force-dynamic';

/**
 * Owner-only CSV export (§4.6, §6.4).
 *
 * The role check here is defence in depth; RLS is what actually decides what
 * this user can read. Demo mode has no server session at all, so the route
 * denies by default and the demo UI exports from the browser instead.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = exportRangeSchema.safeParse({
    business_id: searchParams.get('business_id') ?? '',
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid range' }, { status: 422 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === '1' || !url || !anonKey) {
    return NextResponse.json(
      { error: 'Export requires a signed-in server session.' },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // Read-only request: nothing to persist.
      },
    },
  });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: membership } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', parsed.data.business_id)
    .maybeSingle();

  if (membership?.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can export.' }, { status: 403 });
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('currency, locale, timezone')
    .eq('id', parsed.data.business_id)
    .single();

  const { data: entries, error } = await supabase
    .from('v_entries')
    .select('*')
    .eq('business_id', parsed.data.business_id)
    .gte('occurred_at', `${parsed.data.from}T00:00:00.000Z`)
    .lte('occurred_at', `${parsed.data.to}T23:59:59.999Z`)
    .order('occurred_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const csv = entriesToCsv((entries ?? []) as unknown as EntryView[], {
    currency: business?.currency ?? 'INR',
    locale: business?.locale ?? 'en-IN',
    timezone: business?.timezone ?? 'Asia/Kolkata',
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="khata-${parsed.data.from}-to-${parsed.data.to}.csv"`,
    },
  });
}
