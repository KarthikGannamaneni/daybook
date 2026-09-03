import { AppShell } from '@/components/app/app-shell';
import { PartyScreen } from '@/components/app/party-screen';

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PartyScreen partyId={id} />
    </AppShell>
  );
}
