import type { CSSProperties } from 'react';
import { cx } from './ui';

/**
 * A mini card face down, waiting to be collected: the banner's and the
 * binder's. Apart from AchievementCard so the banner (always loaded) doesn't
 * pull in every card's art.
 */
export function MiniBack({ tier, w }: { tier: number; w: number }) {
  return (
    <div aria-hidden className={cx('ach ach-mini ach-back ach-wait', `ach-t${tier}`)} style={{ '--w': `${w}px` } as CSSProperties}>
      <div className="ach-face"><span className="ach-seal"><span>!</span></span></div>
    </div>
  );
}
