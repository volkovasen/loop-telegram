import { useState } from 'react';
import { AlertCircle, ChevronRight, FolderPlus, Pencil, Trash2, X } from 'lucide-react';
import type { OpenLoop, SpaceDefinition } from './types/open-loop';

export function UnassignedCard({ loop, spaces, onAssign, onOpen }: {
  loop: OpenLoop;
  spaces: SpaceDefinition[];
  onAssign: (loop: OpenLoop, name: string) => void;
  onOpen: (loop: OpenLoop) => void;
}) {
  return <article className="unassigned-card">
    <div className="unassigned-byline">{loop.person?.name ?? 'Из Telegram'} · {loop.type === 'event' ? 'Событие' : 'Нужно распределить'}</div>
    <h3>{loop.title}</h3>
    {loop.source.text && <p className="unassigned-source">{loop.source.text}</p>}
    <div className="unassigned-actions">
      <label className="unassigned-select-wrap">
        <span className="sr-only">Выбрать тему для «{loop.title}»</span>
        <select value="" onChange={e => { if (e.target.value) onAssign(loop, e.target.value); }}>
          <option value="">Выбрать тему…</option>
          {spaces.map(item => <option value={item.name} key={item.id}>{item.name}</option>)}
        </select>
      </label>
      <button type="button" className="unassigned-details" onClick={() => onOpen(loop)} aria-label="Детали задачи"><ChevronRight size={19}/></button>
    </div>
  </article>;
}

type Draft = { id?: string; name: string; description: string };
const emptyDraft: Draft = { name: '', description: '' };

export function SpacesSheet({ spaces, onClose, onSave, onDelete }: {
  spaces: SpaceDefinition[];
  onClose: () => void;
  onSave: (draft: Draft) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const customs = spaces.filter(item => !item.isDefault);

  function edit(item: SpaceDefinition) {
    setDraft({ id: item.id, name: item.name, description: item.description });
    setError('');
  }
  async function save() {
    if (saving) return;
    if (!draft.name.trim() || draft.description.trim().length < 8) {
      setError('Напиши название и критерии: хотя бы 8 символов.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const message = await onSave(draft);
      if (message) setError(message);
      else setDraft(emptyDraft);
    } finally { setSaving(false); }
  }
  async function remove(item: SpaceDefinition) {
    if (saving || !window.confirm(`Удалить «${item.name}»? Задачи останутся, но их нужно будет распределить заново.`)) return;
    setSaving(true);
    setError('');
    try {
      const message = await onDelete(item.id);
      if (message) setError(message);
      else if (draft.id === item.id) setDraft(emptyDraft);
    } finally { setSaving(false); }
  }

  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet spaces-sheet" role="dialog" aria-modal="true" aria-label="Управление темами" onClick={e => e.stopPropagation()}>
      <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрыть"><X size={20}/></button>
      <div className="spaces-sheet-label"><FolderPlus size={17}/> Твои Spaces</div>
      <h2>Разложи по своим темам</h2>
      <p className="spaces-sheet-explain">Создай тему и объясни, что к ней относится. LOOP будет учитывать твои правила при новых пересылках.</p>
      <div className="spaces-manage-list">
        {spaces.map(item => <div className="spaces-manage-row" key={item.id}>
          <span><strong>{item.name}</strong><small>{item.isDefault ? 'Стандартная тема' : `${item.examples?.length ?? 0} примеров для LOOP`}</small></span>
          {!item.isDefault && <div className="spaces-manage-actions">
            <button type="button" onClick={() => edit(item)} aria-label={`Изменить ${item.name}`} disabled={saving}><Pencil size={17}/></button>
            <button type="button" onClick={() => void remove(item)} aria-label={`Удалить ${item.name}`} disabled={saving}><Trash2 size={17}/></button>
          </div>}
        </div>)}
      </div>
      <div className="spaces-editor">
        <strong>{draft.id ? 'Изменить тему' : 'Новая тема'}</strong>
        <label>Название<input maxLength={40} value={draft.name} onChange={e => setDraft(value => ({...value, name:e.target.value}))} placeholder="Например, Футбол"/></label>
        <label>Что сюда относится?<textarea rows={3} maxLength={400} value={draft.description} onChange={e => setDraft(value => ({...value, description:e.target.value}))} placeholder="Тренировки, матчи, игры с командой, взносы и встречи с тренером"/></label>
        {error && <p role="alert" className="spaces-form-error"><AlertCircle size={15}/>{error}</p>}
        <div className="spaces-editor-actions">
          {draft.id && <button type="button" className="spaces-cancel" onClick={() => {setDraft(emptyDraft);setError('');}} disabled={saving}>Отмена</button>}
          <button type="button" className="spaces-save" onClick={() => void save()} disabled={saving}>{saving ? 'Сохраняю…' : draft.id ? 'Сохранить' : 'Добавить тему'}</button>
        </div>
      </div>
    </section>
  </div>;
}
