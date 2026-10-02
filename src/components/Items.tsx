import { useState } from 'react';
import { Bell, CalendarClock, Check } from 'lucide-react';
import { useData } from '../state/DataContext';
import { addItem, restoreItem, setItemDone, softDeleteItem, updateItem } from '../lib/repo';
import { Button, FieldError, Label, Segmented, Sheet, cx, inputClass, useToast } from './ui';
import type { CalendarItem, CalendarItemKind } from '../lib/types';

export type ItemSheetState =
  | { mode: 'add'; date: string; kind: CalendarItemKind }
  | { mode: 'edit'; item: CalendarItem };

const KIND_LABEL: Record<CalendarItemKind, string> = { event: 'Event', reminder: 'Reminder' };

/** "14:00 Network+ exam" / "Call bank" — the compact form used on Today. */
export function itemSummary(it: CalendarItem): string {
  return it.time ? `${it.title} ${it.time}` : it.title;
}

export function ItemSheet({ state, onClose }: { state: ItemSheetState | null; onClose: () => void }) {
  const title = !state ? '' : state.mode === 'add' ? `New ${KIND_LABEL[state.kind].toLowerCase()}` : `Edit ${KIND_LABEL[state.item.kind].toLowerCase()}`;
  return (
    <Sheet open={state !== null} onClose={onClose} title={title}>
      {state && <ItemForm key={state.mode === 'edit' ? state.item.id : `new-${state.date}-${state.kind}`} state={state} onDone={onClose} />}
    </Sheet>
  );
}

function ItemForm({ state, onDone }: { state: ItemSheetState; onDone: () => void }) {
  const { uid } = useData();
  const toast = useToast();
  const existing = state.mode === 'edit' ? state.item : null;
  const [kind, setKind] = useState<CalendarItemKind>(existing?.kind ?? (state.mode === 'add' ? state.kind : 'event'));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.localDate ?? (state.mode === 'add' ? state.date : ''));
  const [time, setTime] = useState(existing?.time ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const t = title.trim();
    if (!t) return setError('Give it a title.');
    if (!date) return setError('Choose a date.');
    const fields = { kind, title: t, localDate: date, time: time || null, note: note.trim() || null };
    if (existing) {
      updateItem(uid, existing.id, fields);
      toast(`Saved ${t}`);
    } else {
      addItem(uid, fields);
      toast(`${KIND_LABEL[kind]} added`);
    }
    onDone();
  };

  return (
    <form
      noValidate
      className="mt-2 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Segmented
        label="Type"
        value={kind}
        onChange={setKind}
        options={[{ value: 'event', label: 'Event' }, { value: 'reminder', label: 'Reminder' }]}
      />
      <div>
        <Label htmlFor="item-title">Title</Label>
        <input
          id="item-title"
          className={inputClass}
          value={title}
          maxLength={80}
          autoFocus={!existing}
          placeholder={kind === 'event' ? 'Network+ exam' : 'Renew gym membership'}
          onChange={(e) => { setTitle(e.target.value); setError(null); }}
        />
        <FieldError>{error}</FieldError>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="item-date">Date</Label>
          <input id="item-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="item-time">Time</Label>
          <input id="item-time" type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-[13px] text-ink-3">Leave the time empty for all day. Reminders show in the app; they don’t send notifications.</p>
      <div>
        <Label htmlFor="item-note">Note</Label>
        <input id="item-note" className={inputClass} value={note} maxLength={280} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary">{existing ? 'Save changes' : `Add ${KIND_LABEL[kind].toLowerCase()}`}</Button>
        {existing && (
          <Button
            variant="danger"
            onClick={() => {
              softDeleteItem(uid, existing.id);
              toast(`Deleted ${existing.title}`, { label: 'Undo', run: () => restoreItem(uid, existing.id) });
              onDone();
            }}
          >
            Delete {KIND_LABEL[existing.kind].toLowerCase()}
          </Button>
        )}
      </div>
    </form>
  );
}

/** A day's events and reminders. Reminders tick off in place; tapping a row edits it. */
export function ItemList({ items, onEdit }: { items: CalendarItem[]; onEdit: (it: CalendarItem) => void }) {
  const { uid } = useData();
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((it) => {
        const done = it.kind === 'reminder' && it.doneAt !== null;
        return (
          <li key={it.id} className="flex items-center gap-1">
            {it.kind === 'reminder' ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={done ? `Mark ${it.title} as not done` : `Mark ${it.title} as done`}
                onClick={() => setItemDone(uid, it.id, !done)}
                className="press flex size-11 shrink-0 items-center justify-center"
              >
                <span className={cx('flex size-5 items-center justify-center rounded-md border-2', done ? 'border-ink bg-ink text-bg' : 'border-ink-3')}>
                  {done && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center text-ink-3" aria-hidden>
                <CalendarClock size={18} />
              </span>
            )}
            <button type="button" onClick={() => onEdit(it)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 pr-1 text-left">
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-[15px] font-medium', done && 'text-ink-3 line-through')}>{it.title}</span>
                <span className="block truncate text-[13px] text-ink-3">
                  {it.kind === 'reminder' ? 'Reminder' : 'Event'} · {it.time ?? 'All day'}
                  {it.note ? ` · ${it.note}` : ''}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AddItemButtons({ onAdd }: { onAdd: (kind: CalendarItemKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button onClick={() => onAdd('event')}><CalendarClock size={17} /> Add event</Button>
      <Button onClick={() => onAdd('reminder')}><Bell size={17} /> Add reminder</Button>
    </div>
  );
}
