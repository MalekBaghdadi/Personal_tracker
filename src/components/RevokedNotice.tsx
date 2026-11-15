import { useAchievements } from '../state/AchievementsContext';
import { TIERS, achievementById } from '../lib/achievementCatalog';
import { REVOKED_WHY, xpOf } from '../lib/achievements';
import { formatLocalDate } from '../lib/dates';
import { Button, Sheet } from './ui';

/**
 * Said once, until read: cards taken back because their ladder's rules were tightened
 * (`auditCollected`). A `<dialog>` so a quiet-moment app update never reloads under it,
 * and not dismissable by a stray tap, because it explains something the user lost.
 */
export function RevokedNotice() {
  const { revokedNotices, dismissRevoked } = useAchievements();
  const many = revokedNotices.length > 1;
  const reasons = [...new Set(revokedNotices.map((r) => r.reason))];
  return (
    <Sheet open={revokedNotices.length > 0} onClose={dismissRevoked} dismissable={false} title={many ? `${revokedNotices.length} cards were taken back` : 'A card was taken back'}>
      <div data-testid="revoked-notice">
        <ul className="mt-1 divide-y divide-line">
          {revokedNotices.map((r) => {
            const def = achievementById.get(r.id)!;
            return (
              <li key={r.id} className="py-2.5">
                <p className="text-[15px] font-semibold">{def.name} <span className="font-normal text-ink-3">· {TIERS[def.tier].name}</span></p>
                <p className="text-[13px] text-ink-2">
                  Earned {formatLocalDate(r.on, 'd MMM yyyy')}{r.detail ? `: ${r.detail}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
        {reasons.map((k) => (
          <p key={k} className="mt-3 text-[14px] text-ink-2">{REVOKED_WHY[k] ?? 'The rules for this card changed, and your history no longer earns it.'}</p>
        ))}
        <p className="mt-3 text-[14px] text-ink-2">
          That takes {xpOf(revokedNotices.map((r) => r.id))} XP off your level. Nothing you logged was changed, and each card comes back by itself, ready to collect, the moment your history earns it under the new rule.
        </p>
        <Button variant="primary" className="mt-4 w-full" onClick={dismissRevoked}>Got it</Button>
      </div>
    </Sheet>
  );
}
