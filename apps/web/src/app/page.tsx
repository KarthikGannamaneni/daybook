import { Suspense } from 'react';
import { AppShell } from '@/components/app/app-shell';
import { TodayScreen } from '@/components/app/today-screen';

/** §6.5: the app opens straight to the composer. No splash, no dashboard first. */
export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <TodayScreen />
      </Suspense>
    </AppShell>
  );
}
