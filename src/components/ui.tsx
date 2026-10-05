import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { PencilLine, X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ── Buttons ────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'quiet' | 'ghost' | 'danger';

export function Button({
  variant = 'quiet',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-ink text-bg hover:opacity-90',
    quiet: 'bg-s2 text-ink hover:bg-s3',
    ghost: 'text-ink-2 hover:text-ink hover:bg-s2',
    danger: 'bg-s2 text-danger hover:bg-s3',
  };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'press inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-medium',
        'disabled:cursor-not-allowed disabled:opacity-40',
        styles[variant],
        className,
      )}
    />
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx('press inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-s2 hover:text-ink', className)}
    >
      {children}
    </button>
  );
}

// ── Sheet ──────────────────────────────────────────────────────────────────

/** Bottom sheet on phones, centred panel on wider screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissable) onClose();
      }}
      onClick={(e) => {
        if (dismissable && e.target === ref.current) onClose();
      }}
      className={cx(
        'm-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-black/55',
        'sm:m-auto sm:max-w-md',
      )}
    >
      {open && (
        <div className="safe-bottom max-h-[88dvh] overflow-y-auto rounded-t-2xl border border-line bg-s1 sm:rounded-2xl sm:pb-0">
          <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-1">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            {dismissable && (
              <IconButton label="Close" onClick={onClose} className="-mr-2">
                <X size={20} />
              </IconButton>
            )}
          </div>
          <div className="px-5 pb-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ── Fields ─────────────────────────────────────────────────────────────────

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-2">
      {children}
    </label>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-[16px] text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none';

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-[13px] text-danger">
      {children}
    </p>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-s2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'press min-h-10 flex-1 rounded-md px-3 text-[14px] font-medium',
            value === o.value ? 'bg-raise text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px]"
    >
      <span>{label}</span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-ink' : 'bg-s3')}>
        <span className={cx('absolute top-1 size-5 rounded-full transition-[left]', checked ? 'left-6 bg-bg' : 'left-1 bg-ink-2')} />
      </span>
    </button>
  );
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DayPicker({ days, onChange, weekStartsOn }: { days: number[]; onChange: (d: number[]) => void; weekStartsOn: 0 | 1 }) {
  const order = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="flex gap-1" role="group" aria-label="Scheduled days">
      {order.map((d) => {
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort())}
            className={cx(
              'press min-h-11 flex-1 rounded-md text-[13px] font-medium',
              on ? 'bg-ink text-bg' : 'bg-s2 text-ink-2 hover:text-ink',
            )}
          >
            {WEEKDAYS[d].slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────

interface ToastOptions {
  /** Adds a "What did you accomplish?" row with a pen. The toast then stays until dismissed or saved. */
  note?: { prompt: string; save: (text: string) => void };
}

interface ToastMsg extends ToastOptions {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

type ShowToast = (text: string, action?: ToastMsg['action'], opts?: ToastOptions) => void;
const ToastCtx = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>();
  const show = useCallback<ShowToast>((text, action, opts) => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, action, ...opts });
    if (!opts?.note) timer.current = window.setTimeout(() => setMsg(null), action ? 5000 : 2500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4 md:bottom-6">
        {msg && (
          <div key={msg.id} className="pointer-events-auto w-full max-w-md rounded-xl border border-line bg-s3 py-1.5 pr-1.5 pl-4 text-[14px] text-ink shadow-lg sm:w-auto sm:min-w-80">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <span>{msg.text}</span>
              {msg.action && (
                <button
                  type="button"
                  className="press min-h-9 rounded-lg px-3 font-semibold text-ink hover:bg-s2"
                  onClick={() => {
                    msg.action!.run();
                    setMsg(null);
                  }}
                >
                  {msg.action.label}
                </button>
              )}
            </div>
            {msg.note && <NoteRow note={msg.note} onDone={() => setMsg(null)} />}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

function NoteRow({ note, onDone }: { note: NonNullable<ToastOptions['note']>; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (!editing) {
    return (
      <div className="flex min-h-9 items-center justify-between gap-2 border-t border-line pt-1">
        <button type="button" className="min-h-9 flex-1 text-left text-ink-2" onClick={() => setEditing(true)}>
          {note.prompt}
        </button>
        <div className="flex">
          <button type="button" aria-label="Add a note to this session" className="press grid size-9 place-items-center rounded-lg text-ink hover:bg-s2" onClick={() => setEditing(true)}>
            <PencilLine size={17} aria-hidden />
          </button>
          <button type="button" aria-label="Dismiss" className="press grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-s2" onClick={onDone}>
            <X size={17} aria-hidden />
          </button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5 border-t border-line pt-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) note.save(text.trim());
        onDone();
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        placeholder={note.prompt}
        aria-label={note.prompt}
        maxLength={280}
        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 text-[16px] text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none"
      />
      <button type="submit" className="press min-h-9 rounded-lg px-3 font-semibold text-ink hover:bg-s2">Save</button>
    </form>
  );
}
