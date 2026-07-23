import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Coins, Copy, ExternalLink } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { UserRole } from '@/backend/auth/contract';
import { AdminGate } from '@/frontend/components/admin-gate';
import {
  PageFrame,
  SectionPanel,
  StatTile,
} from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/frontend/components/ui/avatar';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { Spinner } from '@/frontend/components/ui/spinner';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import {
  adjustManagedUserCredits,
  getManagedUserDetail,
  updateManagedUserBan,
  updateManagedUserRole,
} from '@/frontend/lib/auth';
import { formatTimezoneOptionLabel } from '@/shared/timezone';

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

function interfaceLanguageLabel(
  value: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
) {
  if (value === 'zh-CN') return t('account:preferences.languages.zhCN');
  if (value === 'en') return t('account:preferences.languages.en');
  return value;
}

function marketLabel(
  value: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
) {
  return t(`account:preferences.markets.${value}`, { defaultValue: value });
}

export function AdminUserDetailPage() {
  const { t } = useTranslation(['admin', 'billing', 'account', 'common']);
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [direction, setDirection] = useState<'increase' | 'decrease'>(
    'increase',
  );
  const [points, setPoints] = useState('10');
  const [reason, setReason] = useState('');

  const detail = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => getManagedUserDetail(userId),
    enabled: Boolean(userId) && session.data?.data.user.role === 'admin',
  });

  const ban = useMutation({
    mutationFn: (banned: boolean) => updateManagedUserBan(userId, banned),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('admin:userDetail.banUpdated'));
    },
    onError: () => toast.error(t('admin:userDetail.banError')),
  });

  const updateRole = useMutation({
    mutationFn: (role: UserRole) => updateManagedUserRole(userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('admin:users.roleUpdated'));
    },
    onError: () => toast.error(t('admin:users.roleUpdateError')),
  });

  const payload = detail.data?.data;
  const user = payload?.user;
  const usage = payload?.usage;
  const profile = payload?.profile ?? null;
  const referral = payload?.referral ?? null;
  const isSelf = Boolean(user) && session.data?.data.user.id === user?.id;

  const referralUrl = useMemo(() => {
    if (!referral?.referralPath || typeof window === 'undefined') return '';
    try {
      return new URL(referral.referralPath, window.location.origin).toString();
    } catch {
      return referral.referralPath;
    }
  }, [referral?.referralPath]);

  const pointsValue = Number.parseInt(points, 10);
  const signedDelta = useMemo(() => {
    if (!Number.isInteger(pointsValue) || pointsValue <= 0) return null;
    return direction === 'increase' ? pointsValue : -pointsValue;
  }, [direction, pointsValue]);

  const previewBalance = useMemo(() => {
    if (!usage || signedDelta == null) return null;
    return usage.bonusCredits + signedDelta;
  }, [signedDelta, usage]);

  const adjust = useMutation({
    mutationFn: () => {
      if (signedDelta == null) {
        throw new Error('Invalid credit adjustment');
      }
      return adjustManagedUserCredits(userId, {
        adjustmentId: crypto.randomUUID(),
        delta: signedDelta,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      setReason('');
      setPoints('10');
      setDirection('increase');
      setAdjustOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('admin:userDetail.creditAdjusted'));
    },
    onError: (error: Error) => {
      toast.error(
        error.message === 'INSUFFICIENT_CREDITS' ||
          error.name === 'INSUFFICIENT_CREDITS'
          ? t('admin:userDetail.creditInsufficient')
          : t('admin:userDetail.creditError'),
      );
    },
  });

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/admin/users');
  }

  function openAdjustDialog() {
    setDirection('increase');
    setPoints('10');
    setReason('');
    setAdjustOpen(true);
  }

  async function copyReferral() {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast.success(t('account:referral.copied'));
    } catch {
      toast.error(t('account:referral.copyError'));
    }
  }

  const canSubmitAdjust =
    Boolean(reason.trim()) &&
    signedDelta != null &&
    signedDelta !== 0 &&
    (previewBalance == null || previewBalance >= 0) &&
    !adjust.isPending;

  return (
    <AdminGate
      accessTitle={t('admin:userDetail.accessRequired.title')}
      accessBody={t('admin:userDetail.accessRequired.body')}
      loading={detail.isLoading}
    >
      {detail.isError || (!detail.isLoading && !user) ? (
        <PageFrame
          title={t('admin:userDetail.loadError.title')}
          description={
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('admin:userDetail.back')}
              onClick={goBack}
            >
              <ArrowLeft />
            </Button>
          }
        >
          <Alert variant="destructive">
            <AlertTitle>{t('admin:userDetail.loadError.title')}</AlertTitle>
            <AlertDescription>
              {t('admin:userDetail.loadError.body')}
            </AlertDescription>
          </Alert>
        </PageFrame>
      ) : !user || !usage ? (
        <PageFrame title={t('admin:userDetail.heading')}>
          <Skeleton className="h-64 w-full" />
        </PageFrame>
      ) : (
        <>
          <PageFrame
            title={user.displayName}
            description={
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('admin:userDetail.back')}
                  onClick={goBack}
                >
                  <ArrowLeft />
                </Button>
                <Avatar className="size-9! shrink-0 !rounded-none after:!rounded-none">
                  {user.imageUrl ? (
                    <AvatarImage
                      src={user.imageUrl}
                      alt={user.displayName}
                      className="!rounded-none"
                    />
                  ) : null}
                  <AvatarFallback className="!rounded-none text-sm font-semibold">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={user.role === 'admin' ? 'info' : 'secondary'}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      {user.role === 'admin'
                        ? t('admin:users.roleAdmin')
                        : t('admin:users.roleUser')}
                    </Badge>
                    <Badge
                      variant={user.banned ? 'destructive' : 'up'}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      {user.banned
                        ? t('admin:userDetail.banned')
                        : t('admin:userDetail.active')}
                    </Badge>
                    {isSelf ? (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {t('admin:users.you')}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {user.email ?? t('admin:users.noEmail')}
                  </p>
                </div>
              </div>
            }
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link
                    to={`/admin/credits?clerkUserId=${encodeURIComponent(user.id)}`}
                  >
                    <ExternalLink data-icon="inline-start" />
                    {t('admin:userDetail.related.openCredits')}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link
                    to={`/admin/analyses?clerkUserId=${encodeURIComponent(user.id)}`}
                  >
                    <ExternalLink data-icon="inline-start" />
                    {t('admin:userDetail.related.openAnalyses')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={openAdjustDialog}>
                  <Coins data-icon="inline-start" />
                  {t('admin:userDetail.credits.adjust')}
                </Button>
                <Button
                  variant={user.banned ? 'outline' : 'destructive'}
                  size="sm"
                  disabled={isSelf || ban.isPending}
                  onClick={() => ban.mutate(!user.banned)}
                >
                  {ban.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Ban data-icon="inline-start" />
                  )}
                  {user.banned
                    ? t('admin:userDetail.unban')
                    : t('admin:userDetail.ban')}
                </Button>
              </div>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionPanel title={t('admin:userDetail.sections.profile')}>
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  <DetailRow label={t('admin:userDetail.fields.userId')}>
                    <span className="font-mono text-xs break-all">
                      {user.id}
                    </span>
                  </DetailRow>
                  <DetailRow label={t('admin:userDetail.fields.email')}>
                    {user.email ?? t('admin:users.noEmail')}
                  </DetailRow>
                  <DetailRow label={t('admin:userDetail.fields.registered')}>
                    {formatLocaleDateTimeValue(user.createdAt)}
                  </DetailRow>
                  <DetailRow label={t('admin:userDetail.fields.status')}>
                    <Badge
                      variant={user.banned ? 'destructive' : 'up'}
                      className="h-5 px-1.5 text-[10px]"
                    >
                      {user.banned
                        ? t('admin:userDetail.banned')
                        : t('admin:userDetail.active')}
                    </Badge>
                  </DetailRow>
                </dl>
              </SectionPanel>

              <SectionPanel title={t('admin:userDetail.sections.settings')}>
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  <DetailRow label={t('admin:userDetail.fields.role')}>
                    <Select
                      value={user.role}
                      disabled={isSelf || updateRole.isPending}
                      onValueChange={(role: UserRole) =>
                        updateRole.mutate(role)
                      }
                    >
                      <SelectTrigger
                        aria-label={t('admin:users.roleAria', {
                          name: user.displayName,
                        })}
                        className="w-full max-w-[12rem]"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="user">
                            {t('admin:users.roleUser')}
                          </SelectItem>
                          <SelectItem value="admin">
                            {t('admin:users.roleAdmin')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </DetailRow>
                  <DetailRow label={t('admin:userDetail.credits.subscription')}>
                    {usage.subscription?.status ?? '—'}
                  </DetailRow>
                </dl>
              </SectionPanel>

              <SectionPanel
                title={t('account:preferences.title')}
                description={t('account:preferences.description')}
              >
                {profile ? (
                  <dl className="grid gap-x-6 sm:grid-cols-2">
                    <DetailRow
                      label={t('account:preferences.interfaceLanguage')}
                    >
                      {interfaceLanguageLabel(profile.interfaceLanguage, t)}
                    </DetailRow>
                    <DetailRow label={t('account:preferences.reportLanguage')}>
                      {profile.reportLanguage || '—'}
                    </DetailRow>
                    <DetailRow label={t('account:preferences.timezone')}>
                      {formatTimezoneOptionLabel(profile.timezone)}
                    </DetailRow>
                    <DetailRow label={t('account:preferences.defaultMarket')}>
                      {marketLabel(profile.defaultMarket, t)}
                    </DetailRow>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('admin:userDetail.preferences.empty')}
                  </p>
                )}
              </SectionPanel>

              <SectionPanel
                title={t('account:referral.title')}
                description={t('account:referral.description')}
              >
                {referral ? (
                  <div className="flex flex-col gap-5">
                    <Field>
                      <FieldLabel htmlFor="admin-referral-link">
                        {t('account:referral.link')}
                      </FieldLabel>
                      <div className="flex min-w-0 gap-2">
                        <Input
                          className="min-w-0 font-mono text-xs"
                          id="admin-referral-link"
                          readOnly
                          value={referralUrl}
                        />
                        <Button
                          aria-label={t('account:referral.copy')}
                          onClick={() => void copyReferral()}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <Copy />
                        </Button>
                      </div>
                    </Field>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <dt className="text-sm text-muted-foreground">
                          {t('account:referral.successful')}
                        </dt>
                        <dd className="text-2xl font-semibold tabular-nums">
                          {referral.successfulReferrals}
                        </dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-sm text-muted-foreground">
                          {t('account:referral.earned')}
                        </dt>
                        <dd className="text-2xl font-semibold tabular-nums">
                          {referral.earnedCredits}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('admin:userDetail.referral.empty')}
                  </p>
                )}
              </SectionPanel>

              <SectionPanel
                title={t('admin:userDetail.credits.title')}
                description={t('billing:usage.description')}
                className="lg:col-span-2"
              >
                <div className="flex flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatTile
                      label={t('billing:usage.available')}
                      value={usage.availableCredits}
                      hint={t('billing:usage.availableHelp')}
                      className="border-border/80 bg-muted/40"
                    />
                    <StatTile
                      label={t('billing:usage.period')}
                      value={
                        <span className="text-sky-700 dark:text-sky-300">
                          {usage.periodCredits}
                        </span>
                      }
                      hint={
                        usage.periodEnd
                          ? t('billing:usage.periodHelpDated', {
                              date: formatLocaleDateTimeValue(
                                usage.periodEnd as string | Date,
                              ),
                            })
                          : t('billing:usage.periodHelp')
                      }
                      className="border-sky-500/25 bg-sky-500/8"
                    />
                    <StatTile
                      label={t('billing:usage.bonus')}
                      value={
                        <span className="text-yellow-700 dark:text-yellow-300">
                          {usage.bonusCredits}
                        </span>
                      }
                      hint={t('billing:usage.bonusHelp')}
                      className="border-yellow-500/30 bg-yellow-500/8"
                    />
                    <StatTile
                      label={t('billing:usage.consumed')}
                      value={usage.spentCredits}
                      hint={t('billing:usage.consumedHelp')}
                      className="border-rose-500/20 bg-rose-500/8"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('billing:usage.splitBody')}
                  </p>
                </div>
              </SectionPanel>
            </div>
          </PageFrame>

          <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {t('admin:userDetail.credits.adjust')}
                </DialogTitle>
                <DialogDescription>
                  {t('admin:userDetail.credits.adjustDescription', {
                    name: user.displayName,
                  })}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="credit-direction">
                    {t('admin:userDetail.credits.direction')}
                  </FieldLabel>
                  <Select
                    value={direction}
                    onValueChange={(value: 'increase' | 'decrease') =>
                      setDirection(value)
                    }
                  >
                    <SelectTrigger id="credit-direction" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="increase">
                        {t('admin:userDetail.credits.increase')}
                      </SelectItem>
                      <SelectItem value="decrease">
                        {t('admin:userDetail.credits.decrease')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="credit-points">
                    {t('admin:userDetail.credits.points')}
                  </FieldLabel>
                  <Input
                    id="credit-points"
                    type="number"
                    min={1}
                    step={1}
                    value={points}
                    onChange={(event) => setPoints(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="credit-reason">
                    {t('admin:userDetail.credits.reason')}
                  </FieldLabel>
                  <Input
                    id="credit-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t('admin:userDetail.credits.reasonPlaceholder')}
                  />
                </Field>
                <p className="text-sm text-muted-foreground">
                  {t('admin:userDetail.credits.bonusPreview', {
                    current: usage.bonusCredits,
                    next:
                      previewBalance == null ? '—' : String(previewBalance),
                  })}
                </p>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdjustOpen(false)}
                >
                  {t('admin:userDetail.credits.cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={!canSubmitAdjust}
                  onClick={() => adjust.mutate()}
                >
                  {adjust.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  {t('admin:userDetail.credits.apply')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AdminGate>
  );
}
