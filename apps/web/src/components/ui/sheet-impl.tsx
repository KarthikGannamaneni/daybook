'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/** §6.2: sheets use spring physics (stiffness 400, damping 30), never linear easing. */
export function SheetImpl({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content asChild>
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] border-t border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]',
              className,
            )}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
            <Dialog.Title className="text-body font-semibold">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-label text-muted">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
            <div className="mt-4">{children}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
