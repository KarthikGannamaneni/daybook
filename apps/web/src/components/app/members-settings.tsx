'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Role } from '@khata/shared';
import { useBusiness } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const ROLES: Role[] = ['owner', 'staff', 'accountant'];

/**
 * P1 #6: people and their roles.
 *
 * Adding someone is a 6-character code rather than an email invite: the owner
 * is already in a WhatsApp thread with this person, and an email flow means a
 * mail provider, deliverability and a support burden for no gain.
 */
export function MembersSettings() {
  const t = useTranslations('members');
  const { repo, businessId, bootstrap } = useBusiness();
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<Role>('staff');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = bootstrap.role === 'owner';

  const membersQuery = useQuery({
    queryKey: ['members', businessId],
    queryFn: () => repo.listMembers(businessId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['members', businessId] });

  const invite = useMutation({
    mutationFn: () => repo.createInvite(businessId, inviteRole),
    onSuccess: (result) => {
      setCode(result.code);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const changeRole = useMutation({
    mutationFn: (input: { id: string; role: Role }) => repo.setMemberRole(input.id, input.role),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => repo.removeMember(id),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const members = membersQuery.data ?? [];

  return (
    <section aria-label={t('title')}>
      <h2 className="text-label text-muted">{t('title')}</h2>
      <p className="mt-1 text-body text-muted">{t('hint')}</p>

      <ul className="mt-2 divide-y divide-border" data-testid="members-list">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 py-2" data-testid="member-row">
            <span className="flex-1 truncate text-body">
              {m.is_self ? t('you') : m.label}
            </span>

            {isOwner && !m.is_self ? (
              <select
                aria-label={t('inviteAs')}
                data-testid="member-role"
                className="h-9 rounded-card border border-border bg-surface px-2 text-label"
                value={m.role}
                onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(r)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-label text-muted">{t(m.role)}</span>
            )}

            {isOwner && !m.is_self && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('remove')}
                data-testid="remove-member"
                onClick={() => remove.mutate(m.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}

      {isOwner && (
        <Button variant="quiet" size="md" className="mt-2" data-testid="invite-member" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {t('invite')}
        </Button>
      )}

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen} title={t('invite')} description={t('inviteHint')}>
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5" role="group" aria-label={t('inviteAs')}>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={inviteRole === r}
                data-testid={`invite-role-${r}`}
                onClick={() => setInviteRole(r)}
                className={cn('chip', inviteRole === r && 'chip-selected')}
              >
                {t(r)}
              </button>
            ))}
          </div>

          {code ? (
            <button
              type="button"
              data-testid="invite-code"
              className="chip tabular self-start text-body font-semibold"
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                show({ message: 'Code copied', durationMs: 2000 });
              }}
            >
              {code}
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            data-testid="create-invite"
            disabled={invite.isPending}
            onClick={() => invite.mutate()}
          >
            {code ? 'New code' : t('invite')}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}

/** Redeeming a code. Lives in Settings and in onboarding. */
export function JoinBusiness({ onJoined }: { onJoined?: (businessId: string) => void }) {
  const t = useTranslations('members');
  const { repo } = useBusiness();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: () => repo.acceptInvite(code),
    onSuccess: async (id) => {
      setCode('');
      setError(null);
      await queryClient.invalidateQueries();
      onJoined?.(id);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <section aria-label={t('join')}>
      <h2 className="text-label text-muted">{t('join')}</h2>
      <p className="mt-1 text-body text-muted">{t('joinHint')}</p>
      <div className="mt-2 flex gap-2">
        <TextField
          aria-label={t('join')}
          placeholder="ABC123"
          maxLength={6}
          data-testid="join-code"
          className="tabular uppercase tracking-[0.2em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        <Button
          variant="quiet"
          size="md"
          data-testid="join-business"
          disabled={code.length !== 6 || join.isPending}
          onClick={() => join.mutate()}
        >
          {t('join')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-label text-expense">
          {error}
        </p>
      )}
    </section>
  );
}
