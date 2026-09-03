'use client';

import dynamic from 'next/dynamic';

/**
 * Bottom sheet, loaded on demand.
 *
 * Sheets only ever appear after a tap, so Radix Dialog and the spring animation
 * live in their own chunk instead of the home-screen budget (§10.6).
 */
export const Sheet = dynamic(() => import('./sheet-impl').then((m) => m.SheetImpl), { ssr: false });
