/**
 * Team members and Billing panels for the brand Account Settings screen
 * (rendered from BrandSettings.tsx as its "Team" and "Billing" tabs, no routes
 * of their own). Mirrors the website's ProfileSettings.js team and billing tabs:
 *
 *   Team    GET    /api/business/settings/team          list + seat usage
 *           POST   /api/business/settings/team/invite   {email, role}
 *           PATCH  /api/business/settings/team/{id}     {role}
 *           DELETE /api/business/settings/team/{id}     remove / cancel invite
 *           Each write answers with the fresh team payload, so no re-fetch.
 *   Billing GET    /api/business/settings/billing + /summary (read only)
 *
 * Only the workspace owner or a team admin can invite, change roles or remove
 * (the backend enforces it with a 403; the buttons are hidden for others).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Alert } from '../components/AppAlert';
import ChoiceSheet from '../components/ChoiceSheet';
import { SkeletonForm } from '../components/Skeleton';
import { Text, TextInput } from '../components/Text';
import {
  getBilling,
  getBusinessSummary,
  getMe,
  getTeamPayload,
  inviteTeamMember,
  NetworkError,
  removeTeamMember,
  updateTeamMemberRole,
} from '../api';
import { scale, fontScale } from '../theme';

export type TeamRole = 'admin' | 'member' | 'viewer';

/** Same three roles and copy as the website's invite modal. */
export const TEAM_ROLES: Array<{ key: TeamRole; label: string; desc: string }> = [
  {
    key: 'admin',
    label: 'Admin',
    desc: 'Full access, including inviting and removing teammates.',
  },
  {
    key: 'member',
    label: 'Member',
    desc: 'Can create and manage campaigns, deals and work - but not the team.',
  },
  {
    key: 'viewer',
    label: 'Viewer',
    desc: 'Read-only. Can see everything but cannot make changes.',
  },
];

/** Only the workspace owner or a team admin can change the team. */
export function canManageTeam(teamRole: unknown): boolean {
  return ['owner', 'admin'].includes(String(teamRole || 'owner'));
}

/** Returns an error message, or '' when the invite email is usable. */
export function inviteEmailError(raw: string): string {
  const email = raw.trim();
  if (!email) return 'Enter an email to invite';
  // The backend validates properly; this only catches obvious typos early.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  return '';
}

/** Share of the monthly budget used, 0-100 (0 when no limit is set). */
export function budgetPercent(used: unknown, limit: unknown): number {
  const u = Number(used || 0);
  const l = Number(limit || 0);
  return l ? Math.min(100, Math.round((u / l) * 100)) : 0;
}

const rupees = (value: unknown) =>
  `₹${Number(value || 0).toLocaleString('en-IN')}`;

/** A dropped connection says so, instead of the raw fetch error. */
const failText = (e: any, fallback: string) =>
  e instanceof NetworkError
    ? "You're offline. Check your connection and try again."
    : e?.message || fallback;

type Member = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  is_owner?: boolean;
};

type Team = { members: Member[]; seat_limit: number; seats_used: number };

const toTeam = (raw: Record<string, any> | null | undefined): Team => ({
  members: Array.isArray(raw?.members) ? raw!.members : [],
  seat_limit: Number(raw?.seat_limit || 10),
  seats_used: Number(raw?.seats_used || 0),
});

const initialOf = (text?: string) =>
  String(text || '?').replace(/^@/, '').charAt(0).toUpperCase();

export function TeamPanel({
  token,
  onToast,
}: {
  token: string;
  onToast: (message: string) => void;
}) {
  const [team, setTeam] = useState<Team | null>(null);
  const [me, setMe] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('member');
  const [inviteError, setInviteError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [roleFor, setRoleFor] = useState<Member | null>(null);

  useEffect(() => {
    let active = true;
    setTeam(null);
    setError('');
    Promise.all([getTeamPayload(token), getMe(token)])
      .then(([payload, user]) => {
        if (!active) return;
        setTeam(toTeam(payload));
        setMe((user || {}) as Record<string, any>);
      })
      .catch(e => {
        if (active) setError(failText(e, 'Could not load your team.'));
      });
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  const canManage = canManageTeam(me.team_role);

  /** Runs one write; every team endpoint returns the updated team payload. */
  const write = useCallback(
    async (run: () => Promise<any>, done: string, failFallback: string) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const payload = await run();
        setTeam(toTeam(payload));
        onToast(done);
        return true;
      } catch (e: any) {
        Alert.alert('Could not complete', failText(e, failFallback));
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [onToast],
  );

  const sendInvite = useCallback(async () => {
    const problem = inviteEmailError(email);
    setInviteError(problem);
    if (problem) return;
    const ok = await write(
      () => inviteTeamMember(token, email.trim(), role),
      'Invitation sent',
      'Failed to invite member',
    );
    if (ok) {
      setEmail('');
      setRole('member');
      setInviteOpen(false);
    }
  }, [email, role, token, write]);

  const confirmRemove = (member: Member) => {
    if (!member.id) {
      Alert.alert('Cannot remove', 'Cannot remove this member');
      return;
    }
    const invited = member.status === 'invited';
    Alert.alert(
      invited ? 'Cancel invite' : 'Remove member',
      `${invited ? 'Cancel the invite for' : 'Remove'} ${member.name || member.email}?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: invited ? 'Cancel invite' : 'Remove',
          style: 'destructive',
          onPress: () =>
            write(
              () => removeTeamMember(token, member.id as string),
              invited ? 'Invite cancelled' : 'Team member removed',
              'Failed to remove member',
            ),
        },
      ],
    );
  };

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => setReloadKey(k => k + 1)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!team) {
    return (
      <View style={styles.card}>
        <SkeletonForm rows={3} />
      </View>
    );
  }

  return (
    <View testID="brand-team-panel">
      <View style={styles.card}>
        <Text style={styles.title}>Team Members</Text>
        <Text style={styles.sub}>
          Invite coworkers to your brand workspace. They log in with their own
          password and share your campaigns, deals and wallet. Their access
          depends on the role you give them.
        </Text>

        {canManage ? (
          inviteOpen ? (
            <View style={styles.invite}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={[styles.input, !!inviteError && styles.inputError]}
                value={email}
                onChangeText={text => {
                  setEmail(text);
                  setInviteError('');
                }}
                placeholder="teammate@company.com"
                placeholderTextColor="#A9ADC2"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Teammate email address"
              />
              {!!inviteError && <Text style={styles.errorText}>{inviteError}</Text>}

              <Text style={[styles.label, styles.gap]}>Role &amp; access</Text>
              {TEAM_ROLES.map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.roleOption, role === r.key && styles.roleOptionOn]}
                  onPress={() => setRole(r.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: role === r.key }}
                >
                  <Text style={styles.roleOptionTitle}>{r.label}</Text>
                  <Text style={styles.roleOptionDesc}>{r.desc}</Text>
                </TouchableOpacity>
              ))}

              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.ghost, styles.flex]}
                  onPress={() => {
                    setInviteOpen(false);
                    setInviteError('');
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primary, styles.flex, busy && styles.disabled]}
                  onPress={sendInvite}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryText}>Send invite</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.primary}
              onPress={() => setInviteOpen(true)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Invite member</Text>
            </TouchableOpacity>
          )
        ) : (
          <Text style={styles.note}>
            Only the workspace owner or an admin can invite or remove teammates.
          </Text>
        )}
      </View>

      {team.members.map(member => {
        const isYou = !!me.id && String(member.id) === String(me.id);
        const manageable = canManage && !member.is_owner && !!member.id;
        return (
          <View key={member.id || member.email} style={styles.member}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {initialOf(member.name || member.email)}
              </Text>
            </View>
            <View style={styles.memberText}>
              <Text style={styles.memberName} numberOfLines={1}>
                {(member.name || member.email || '').replace(/^@/, '')}
                {isYou ? '  (You)' : ''}
              </Text>
              <Text style={styles.memberEmail} numberOfLines={1}>
                {member.email}
              </Text>
              <View style={styles.chips}>
                {manageable ? (
                  <TouchableOpacity
                    style={styles.chipBtn}
                    onPress={() => setRoleFor(member)}
                    disabled={busy}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Change role for ${member.name || member.email}, currently ${member.role}`}
                  >
                    <Text style={styles.chipText}>{member.role} ▾</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.chipBtn}>
                    <Text style={styles.chipText}>{member.role}</Text>
                  </View>
                )}
                <View style={[styles.chipBtn, styles.statusChip]}>
                  <Text style={styles.chipText}>
                    {member.status === 'invited'
                      ? 'Invited'
                      : member.status === 'inactive'
                      ? 'Inactive'
                      : 'Active'}
                  </Text>
                </View>
              </View>
            </View>
            {manageable && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => confirmRemove(member)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={
                  member.status === 'invited' ? 'Cancel invite' : 'Remove member'
                }
              >
                <Text style={styles.removeText}>
                  {member.status === 'invited' ? 'Cancel' : 'Remove'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {canManage && team.members.length <= 1 && (
        <Text style={styles.note}>
          No teammates yet. Tap Invite member to add your first one.
        </Text>
      )}
      <Text style={styles.note}>
        Workspace: {team.seats_used || team.members.length} / {team.seat_limit} seats
        used.
      </Text>

      <ChoiceSheet
        visible={!!roleFor}
        title="Change role"
        message={roleFor ? roleFor.name || roleFor.email : undefined}
        options={TEAM_ROLES.map(r => ({
          label: `${r.label}${roleFor?.role === r.key ? ' (current)' : ''}`,
          onPress: () => {
            if (!roleFor?.id || roleFor.role === r.key) return;
            const id = roleFor.id;
            write(
              () => updateTeamMemberRole(token, id, r.key),
              'Role updated',
              'Failed to update role',
            );
          },
        }))}
        onClose={() => setRoleFor(null)}
      />
    </View>
  );
}

export function BillingPanel({
  token,
  onOpenWallet,
}: {
  token: string;
  /** Opens the wallet (history / payment methods). Hidden when not wired. */
  onOpenWallet?: () => void;
}) {
  const [billing, setBilling] = useState<Record<string, any> | null>(null);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setBilling(null);
    setError('');
    Promise.all([getBilling(token), getBusinessSummary(token)])
      .then(([b, s]) => {
        if (!active) return;
        setBilling((b || {}) as Record<string, any>);
        setSummary(s || {});
      })
      .catch(e => {
        if (active) setError(failText(e, 'Could not load billing.'));
      });
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => setReloadKey(k => k + 1)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!billing) {
    return (
      <View style={styles.card}>
        <SkeletonForm rows={3} />
      </View>
    );
  }

  const used = Number(billing.monthly_budget_used || 0);
  const limit = Number(billing.monthly_budget_limit || 0);
  const percent = budgetPercent(used, limit);

  return (
    <View testID="brand-billing-panel">
      <View style={styles.card}>
        <Text style={styles.title}>Billing &amp; Subscription</Text>
        <Text style={styles.sub}>
          Your current plan, wallet and this month&apos;s campaign budget.
        </Text>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Active plan</Text>
          <Text style={styles.statValue}>
            {summary.active_plan || billing.plan_name || 'Pro'}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Wallet</Text>
          <Text style={styles.statValue}>{rupees(summary.wallet_balance)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Team</Text>
          <Text style={styles.statValue}>{summary.team_count || 0} members</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Monthly campaign budget</Text>
        <Text style={styles.statValue}>
          {rupees(used)} / {rupees(limit)}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.note}>{percent}% of budget used this month</Text>
        {/* The website has no invoice page either: a payment receipt is emailed after every wallet recharge. */}
        <Text style={styles.note}>
          A payment receipt is emailed to the account owner after every wallet recharge.
        </Text>
        {!!billing.next_billing_date && (
          <Text style={styles.note}>Next billing: {String(billing.next_billing_date)}</Text>
        )}
      </View>

      {onOpenWallet && (
        <TouchableOpacity
          style={styles.primary}
          onPress={onOpenWallet}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Wallet &amp; transaction history</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: scale(16),
    marginBottom: scale(12),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  title: {
    fontSize: fontScale(15),
    fontFamily: 'ReadexPro-SemiBold',
    fontWeight: '800',
    color: '#15163F',
  },
  sub: {
    marginTop: scale(4),
    marginBottom: scale(12),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#7E829D',
  },
  note: {
    marginTop: scale(8),
    fontSize: fontScale(12),
    lineHeight: fontScale(18),
    color: '#7E829D',
  },
  label: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#15163F',
    marginBottom: scale(6),
  },
  gap: { marginTop: scale(14) },
  input: {
    height: scale(46),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
    paddingHorizontal: scale(12),
    paddingVertical: 0,
    // Literal 16: fontScale(16) drops below 16 on phones narrower than 390 and iOS then zooms in.
    fontSize: 16,
    color: '#15163F',
  },
  inputError: { borderColor: '#E5484D', backgroundColor: '#FFF6F6' },
  errorText: {
    marginTop: scale(6),
    marginBottom: scale(6),
    fontSize: fontScale(12),
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: '#C4373B',
  },
  invite: { marginTop: scale(4) },
  roleOption: {
    minHeight: scale(44),
    marginBottom: scale(8),
    padding: scale(12),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FBFBFE',
  },
  roleOptionOn: { borderColor: '#3D4FD8', backgroundColor: '#EEF0FE' },
  roleOptionTitle: {
    fontSize: fontScale(13),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  roleOptionDesc: {
    marginTop: scale(2),
    fontSize: fontScale(11.5),
    lineHeight: fontScale(16),
    color: '#7E829D',
  },
  row: { flexDirection: 'row', gap: scale(10), marginTop: scale(6) },
  flex: { flex: 1 },
  primary: {
    marginTop: scale(8),
    height: scale(48),
    borderRadius: scale(14),
    backgroundColor: '#3D4FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ghost: {
    marginTop: scale(8),
    height: scale(48),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#D9DCF3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#5C6180',
  },
  disabled: { opacity: 0.6 },

  member: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(12),
    marginBottom: scale(10),
    borderRadius: scale(16),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEEF6',
  },
  avatar: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: '#EEF0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontScale(15),
    fontFamily: 'Inter-ExtraBold',
    fontWeight: '800',
    color: '#3D4FD8',
  },
  memberText: { flex: 1, minWidth: 0, marginHorizontal: scale(12) },
  memberName: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  memberEmail: { fontSize: fontScale(12), color: '#7E829D', marginTop: scale(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6), marginTop: scale(6) },
  chipBtn: {
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    borderRadius: scale(8),
    backgroundColor: '#F0F1F7',
  },
  statusChip: { backgroundColor: '#E2F7EE' },
  chipText: {
    fontSize: fontScale(11),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#4A4F70',
    textTransform: 'capitalize',
  },
  removeBtn: {
    minWidth: scale(60),
    minHeight: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: fontScale(12.5),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#C4373B',
  },

  stat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: scale(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E9EAF3',
  },
  statLabel: { fontSize: fontScale(13), color: '#7E829D' },
  statValue: {
    fontSize: fontScale(14),
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    color: '#15163F',
  },
  track: {
    marginTop: scale(10),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: '#E7E8F3',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: scale(4), backgroundColor: '#3D4FD8' },
});
