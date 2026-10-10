import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from './ui';

const COLORS = ['#5b8def', '#e0a03a', '#4cc38a', '#e5484d', '#b07ff0', '#f2c94c'];
const DURATION_MS = 2200;

/**
 * One burst of confetti over the whole screen, from just above `origin`
 * (a fraction of the viewport). Draws on a canvas, never blocks taps, and
 * removes itself when done. Skipped entirely under reduced motion.
 */
export function Confetti({ origin = { x: 0.5, y: 0.3 }, onDone }: { origin?: { x: number; y: number }; onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || prefersReducedMotion()) {
      onDone?.();
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: 140 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = 7 + Math.random() * 9;
      return {
        x: origin.x * w,
        y: origin.y * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        round: Math.random() < 0.3,
      };
    });

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = t > DURATION_MS - 500 ? Math.max(0, (DURATION_MS - t) / 500) : 1;
      for (const p of pieces) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.32;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Flutter: squash the width as it spins.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size * Math.abs(Math.cos(p.rot * 2)), p.size / 2);
        }
        ctx.restore();
      }
      if (t < DURATION_MS) frame = requestAnimationFrame(tick);
      else onDone?.();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // One burst per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // On body, so an animating ancestor can't become its containing block.
  return createPortal(<canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-dvh w-screen" />, document.body);
}
