import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Briefcase,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock3,
  House,
  Search,
  UserRound,
  Users,
  X
} from 'lucide-react';
import type { LoopSpace, OpenLoop } from './types/open-loop';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

type Tab = 'today' | 'people' | 'memory';
type SpaceFilter = 'Все' | LoopSpace;

const meta = {
  reply: { icon: '↩', label: 'Ждёт ответа' },
  todo: { icon: '✓', label: 'Нужно сделать' },
  waiting: { icon: '←', label: 'Ждёшь' },
  event: { icon: '◷', label: 'Событие' },
  saved: { icon: '◇', label: 'В памяти' }
};

const spaces: SpaceFilter[] = ['Все', 'Дом', 'Работа', 'Личное'];

function attentionText(count: number) {
  if (count === 1) return '1 вещь требует внимания';
  if (count >= 2 && count <= 4) return `${count} вещи требуют внимания`;
  return `${count} вещей требуют внимания`;
}

function formatDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function telegramLink(loop: OpenLoop) {
  const username = loop.person?.username?.replace(/^@/, '');
  if (username) return `https://t.me/${username}`;
  if (loop.person?.telegramUserId) return `tg://user?id=${loop.person.telegramUserId}`;
  return undefined;
}

function googleCalendarLink(loop: OpenLoop) {
  if (!loop.dueAt) return undefined;
  const start = new Date(loop.dueAt);
  if (Number.isNaN(start.getTime())) return undefined;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: loop.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: loop.source.text ? `Из Telegram: ${loop.source.text}` : 'Добавлено из LOOP'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function App() {
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [space, setSpace] = useState<SpaceFilter>('Все');
  const [selected, setSelected] = useState<OpenLoop | null>(null);
  const [personName, setPersonName] = useState<string | null>(null);
  const [memoryQuery, setMemoryQuery] = useState('');

  async function loadLoops() {
    try {
      const res = await fetch(`${API_URL}/loops`);
      if (!res.ok) throw new Error('API error');
      setLoops(await res.json());
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }

  useEffect(() => {
    loadLoops();
    const timer = setInterval(loadLoops, 2000);
    return () => clearInterval(timer);
  }, []);

  const attention = useMemo(() => {
    const now = Date.now();
    return loops.filter((loop) => {
      if (loop.type === 'saved') return false;
      if (loop.status === 'open' || loop.status === 'suggested') return true;
      if (loop.status === 'snoozed' && loop.dueAt) return new Date(loop.dueAt).getTime() <= now;
      return false;
    });
  }, [loops]);

  const visibleAttention = useMemo(
    () => attention.filter((loop) => space === 'Все' || loop.space === space),
    [attention, space]
  );

  const history = useMemo(
    () => loops.filter((loop) => loop.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [loops]
  );

  const memory = useMemo(() => {
    const q = memoryQuery.trim().toLocaleLowerCase('ru-RU');
    return loops.filter((loop) => {
      if (loop.type !== 'saved' || loop.status === 'dismissed') return false;
      if (!q) return true;
      const haystack = [loop.title, loop.memoryCategory, loop.space, loop.person?.name, loop.source.text]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ru-RU');
      return q.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [loops, memoryQuery]);

  const people = useMemo(() => {
    const map = new Map<string, OpenLoop[]>();
    for (const loop of loops) {
      const name = loop.person?.name;
      if (!name) continue;
      map.set(name, [...(map.get(name) ?? []), loop]);
    }
    return [...map.entries()].sort((a, b) => {
      const openA = a[1].filter((x) => x.status === 'open' || x.status === 'suggested').length;
      const openB = b[1].filter((x) => x.status === 'open' || x.status === 'suggested').length;
      return openB - openA || a[0].localeCompare(b[0], 'ru');
    });
  }, [loops]);

  async function patchLoop(id: string, patch: Partial<OpenLoop>) {
    setLoops((items) => items.map((loop) => (loop.id === id ? { ...loop, ...patch } : loop)));
    const res = await fetch(`${API_URL}/loops/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) await loadLoops();
  }

  async function done(loop: OpenLoop) {
    const completedAt = new Date().toISOString();
    await patchLoop(loop.id, { status: 'done', completedAt });
    setSelected(null);
  }

  async function snooze(loop: OpenLoop) {
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(9, 0, 0, 0);
    await patchLoop(loop.id, { status: 'snoozed', dueAt: until.toISOString() });
    setSelected(null);
  }

  const title = tab === 'today' ? 'Сегодня' : tab === 'people' ? 'Люди' : 'Память';

  return (
    <main className="shell">
      <header>
        <div className="eyebrow">LOOP</div>
        <h1>{title}</h1>
        <p>
          {!connected
            ? 'API не подключён'
            : tab === 'today'
              ? attention.length
                ? attentionText(attention.length)
                : 'Хвостов нет. Красиво.'
              : tab === 'people'
                ? `${people.length} человек в контексте`
                : `${memory.length} сохранено`}
        </p>
      </header>

      {tab === 'today' && (
        <TodayView
          loops={visibleAttention}
          history={history}
          space={space}
          onSpace={setSpace}
          onSelect={setSelected}
          onDone={done}
          onSnooze={snooze}
        />
      )}

      {tab === 'people' && (
        <PeopleView
          people={people}
          selectedName={personName}
          onSelectName={setPersonName}
          onSelectLoop={setSelected}
        />
      )}

      {tab === 'memory' && (
        <MemoryView query={memoryQuery} onQuery={setMemoryQuery} loops={memory} onSelect={setSelected} />
      )}

      <nav>
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
          <Clock3 />Сегодня
        </button>
        <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          <Users />Люди
        </button>
        <button className={tab === 'memory' ? 'active' : ''} onClick={() => setTab('memory')}>
          <Brain />Память
        </button>
      </nav>

      {selected && <LoopDetail loop={selected} onClose={() => setSelected(null)} onDone={done} onSnooze={snooze} />}
    </main>
  );
}

function TodayView({
  loops,
  history,
  space,
  onSpace,
  onSelect,
  onDone,
  onSnooze
}: {
  loops: OpenLoop[];
  history: OpenLoop[];
  space: SpaceFilter;
  onSpace: (space: SpaceFilter) => void;
  onSelect: (loop: OpenLoop) => void;
  onDone: (loop: OpenLoop) => void;
  onSnooze: (loop: OpenLoop) => void;
}) {
  return (
    <>
      <div className="spaces">
        {spaces.map((item) => (
          <button key={item} className={space === item ? 'selected' : ''} onClick={() => onSpace(item)}>
            {item === 'Дом' && <House size={14} />}
            {item === 'Работа' && <Briefcase size={14} />}
            {item === 'Личное' && <UserRound size={14} />}
            {item}
          </button>
        ))}
      </div>

      <section className="stack">
        {loops.map((loop) => (
          <LoopCard key={loop.id} loop={loop} onOpen={() => onSelect(loop)} onDone={() => onDone(loop)} onSnooze={() => onSnooze(loop)} />
        ))}
      </section>

      {!loops.length && (
        <div className="empty">
          <Check size={26} />
          <strong>Здесь всё закрыто</strong>
          <span>Новые важные сообщения появятся автоматически после пересылки боту.</span>
        </div>
      )}

      {!!history.length && (
        <section className="history-block">
          <div className="section-title">Выполнено</div>
          {history.slice(0, 8).map((loop) => (
            <button key={loop.id} className="history-row" onClick={() => onSelect(loop)}>
              <span className="history-check">✓</span>
              <span>
                <strong>{loop.title}</strong>
                <small>{loop.person?.name ?? loop.space ?? 'LOOP'} · {formatDate(loop.completedAt)}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>
      )}
    </>
  );
}

function PeopleView({
  people,
  selectedName,
  onSelectName,
  onSelectLoop
}: {
  people: [string, OpenLoop[]][];
  selectedName: string | null;
  onSelectName: (name: string | null) => void;
  onSelectLoop: (loop: OpenLoop) => void;
}) {
  if (selectedName) {
    const items = people.find(([name]) => name === selectedName)?.[1] ?? [];
    const open = items.filter((loop) => loop.status === 'open' || loop.status === 'suggested' || loop.status === 'snoozed');
    const saved = items.filter((loop) => loop.type === 'saved');
    const done = items.filter((loop) => loop.status === 'done');
    const chatLoop = items.find((loop) => telegramLink(loop));
    const chat = chatLoop ? telegramLink(chatLoop) : undefined;

    return (
      <section className="person-page">
        <button className="back" onClick={() => onSelectName(null)}>← Все люди</button>
        <div className="person-hero">
          <div className="avatar">{selectedName.slice(0, 1).toUpperCase()}</div>
          <div><h2>{selectedName}</h2><p>{open.length} открыто · {saved.length} в памяти</p></div>
        </div>
        {chat && <a className="wide-action" href={chat}>Открыть чат в Telegram</a>}
        <PersonSection title="Незакрыто" loops={open.filter((x) => x.type !== 'saved')} onSelect={onSelectLoop} />
        <PersonSection title="Советовал / сохранено" loops={saved} onSelect={onSelectLoop} />
        <PersonSection title="Закрыто" loops={done.slice(0, 6)} onSelect={onSelectLoop} />
      </section>
    );
  }

  return (
    <section className="people-list">
      {people.map(([name, items]) => {
        const openCount = items.filter((loop) => loop.status === 'open' || loop.status === 'suggested').length;
        const savedCount = items.filter((loop) => loop.type === 'saved').length;
        return (
          <button key={name} className="person-row" onClick={() => onSelectName(name)}>
            <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
            <span><strong>{name}</strong><small>{openCount} открыто · {savedCount} сохранено</small></span>
            <ChevronRight size={18} />
          </button>
        );
      })}
      {!people.length && <div className="empty"><Users size={26} /><strong>Людей пока нет</strong><span>Перешли сообщение от человека, и LOOP соберёт контекст.</span></div>}
    </section>
  );
}

function PersonSection({ title, loops, onSelect }: { title: string; loops: OpenLoop[]; onSelect: (loop: OpenLoop) => void }) {
  if (!loops.length) return null;
  return (
    <div className="person-section">
      <div className="section-title">{title}</div>
      {loops.map((loop) => (
        <button key={loop.id} className="mini-loop" onClick={() => onSelect(loop)}>
          <span>{meta[loop.type].icon}</span>
          <span><strong>{loop.title}</strong><small>{loop.space ?? 'Личное'}{loop.dueAt ? ` · ${formatDate(loop.dueAt)}` : ''}</small></span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

function MemoryView({ query, onQuery, loops, onSelect }: { query: string; onQuery: (value: string) => void; loops: OpenLoop[]; onSelect: (loop: OpenLoop) => void }) {
  return (
    <>
      <label className="search-box">
        <Search size={18} />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Японский ресторан от Холли…" />
      </label>
      <div className="memory-hint">Ищи по человеку, категории, месту или словам из исходного сообщения.</div>
      <section className="memory-grid">
        {loops.map((loop) => (
          <button key={loop.id} className="memory-card" onClick={() => onSelect(loop)}>
            <div className="memory-top"><span>{loop.memoryCategory ?? 'Сохранено'}</span><span>{loop.space ?? 'Личное'}</span></div>
            <strong>{loop.title}</strong>
            <small>{loop.person?.name ? `От ${loop.person.name}` : 'Из Telegram'}</small>
            {loop.source.text && <p>“{loop.source.text}”</p>}
          </button>
        ))}
      </section>
      {!loops.length && <div className="empty"><Brain size={26} /><strong>Ничего не нашлось</strong><span>Сохрани рекомендацию ресторана, фильма, книги или места через бота.</span></div>}
    </>
  );
}

function LoopCard({ loop, onOpen, onDone, onSnooze }: { loop: OpenLoop; onOpen: () => void; onDone: () => void; onSnooze: () => void }) {
  const m = meta[loop.type];
  return (
    <article className={`card ${loop.type}`} onClick={onOpen}>
      <div className="row">
        <span className="badge"><b>{m.icon}</b>{m.label}</span>
        <span className="confidence">{loop.space ?? 'Личное'} · {Math.round(loop.confidence * 100)}%</span>
      </div>
      <h2>{loop.title}</h2>
      <div className="card-meta">
        {loop.person && <span>{loop.person.name}</span>}
        {loop.dueAt && <span>⏰ {formatDate(loop.dueAt)}</span>}
      </div>
      {loop.source.text && <blockquote>“{loop.source.text}”</blockquote>}
      <div className="actions" onClick={(event) => event.stopPropagation()}>
        <button className="primary" onClick={onDone}>{loop.type === 'waiting' ? 'Получено' : 'Готово'}</button>
        <button className="ghost" onClick={onSnooze}>До завтра</button>
      </div>
    </article>
  );
}

function LoopDetail({ loop, onClose, onDone, onSnooze }: { loop: OpenLoop; onClose: () => void; onDone: (loop: OpenLoop) => void; onSnooze: (loop: OpenLoop) => void }) {
  const chat = telegramLink(loop);
  const calendar = googleCalendarLink(loop);
  const m = meta[loop.type];
  const isDone = loop.status === 'done';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" onClick={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose}><X size={20} /></button>
        <div className="detail-badge"><span>{m.icon}</span>{m.label}</div>
        <h2>{loop.title}</h2>
        <div className="detail-meta">
          {loop.space && <span>{loop.space}</span>}
          {loop.memoryCategory && <span>{loop.memoryCategory}</span>}
          {loop.dueAt && <span>⏰ {formatDate(loop.dueAt)}</span>}
          {isDone && <span>✓ Закрыто {formatDate(loop.completedAt)}</span>}
        </div>

        {loop.person && (
          <div className="detail-person">
            <div className="avatar">{loop.person.name.slice(0, 1).toUpperCase()}</div>
            <div><small>Человек</small><strong>{loop.person.name}</strong></div>
          </div>
        )}

        {loop.source.text && <div className="source-block"><small>Исходное сообщение</small><p>“{loop.source.text}”</p></div>}

        <div className="detail-actions">
          {chat && <a href={chat}>Открыть чат в Telegram</a>}
          {calendar && <a href={calendar} target="_blank" rel="noreferrer"><CalendarPlus size={17} />В календарь</a>}
        </div>

        {!isDone && loop.type !== 'saved' && (
          <div className="sheet-footer">
            <button className="primary" onClick={() => onDone(loop)}>{loop.type === 'waiting' ? 'Получено' : 'Готово'}</button>
            <button className="ghost" onClick={() => onSnooze(loop)}>До завтра</button>
          </div>
        )}
      </section>
    </div>
  );
}
