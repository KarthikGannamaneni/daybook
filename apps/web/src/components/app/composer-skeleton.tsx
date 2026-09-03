/**
 * The first paint of the home screen.
 *
 * §6.2 asks for skeletons rather than spinners, and §10.6 puts LCP under 1.5 s
 * on a slow connection. This is a server-rendered stand-in with the composer's
 * real shape and its real labels, so the largest element paints with the HTML
 * instead of waiting for hydration, the data layer and the first query.
 *
 * It is deliberately inert: no state, no handlers, nothing to tap by accident.
 */
export function ComposerSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col" aria-busy="true">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-9 w-9 rounded-full" />
      </header>

      <main className="flex-1 px-4 pb-28">
        <section className="card p-4">
          <div className="flex gap-1.5">
            <span className="chip chip-selected">Expense</span>
            <span className="chip">Income</span>
          </div>

          <p className="mt-3 flex items-baseline gap-2 text-amount font-semibold text-muted/50">
            <span aria-hidden>₹</span>
            <span className="tabular">0</span>
          </p>

          <div className="mt-3 flex gap-2">
            <span className="skeleton h-8 w-32 rounded-chip" />
            <span className="skeleton h-8 w-28 rounded-chip" />
            <span className="skeleton h-8 w-24 rounded-chip" />
          </div>
          <div className="mt-3 flex gap-2">
            <span className="skeleton h-8 w-20 rounded-chip" />
            <span className="skeleton h-8 w-24 rounded-chip" />
            <span className="skeleton h-8 w-20 rounded-chip" />
          </div>

          <div className="mt-3 grid gap-2">
            <div className="skeleton h-11 w-full rounded-card" />
            <div className="skeleton h-11 w-full rounded-card" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="skeleton h-11 w-40 rounded-card" />
            <span className="flex h-14 flex-1 items-center justify-center rounded-card bg-accent text-body font-medium text-accent-fg">
              Save
            </span>
          </div>
        </section>

        <section className="card mt-4 p-4">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-2 h-9 w-36" />
        </section>
      </main>
    </div>
  );
}
