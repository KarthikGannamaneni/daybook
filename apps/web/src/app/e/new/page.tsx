import { Suspense } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { TodayScreen } from '@/components/app/today-screen';

/**
 * §6.5 deep link: /e/new?amount=450&note=tea opens the composer prefilled.
 * This is the link the WhatsApp confirmation points at for editing.
 */
export default function NewEntryPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <TodayScreen />
      </Suspense>
    </AppShell>
  );
}
