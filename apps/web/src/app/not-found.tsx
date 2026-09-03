import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-3 p-6">
      <h1 className="text-body font-semibold">That page does not exist.</h1>
      <Link href="/" className="text-body text-accent">
        Go to today
      </Link>
    </main>
  );
}
