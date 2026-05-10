import { useState, useEffect, type FC } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, X, Plus, Check, Pencil } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import type { AgendaItem } from '../../types';

interface AgendaEditorProps {
  items: AgendaItem[];
  onSave: (items: AgendaItem[]) => Promise<void>;
  canEdit: boolean;
}

interface AgendaItemRowProps {
  item: AgendaItem;
  index: number;
  onDelete: (id: string) => void;
}

const AgendaItemRow: FC<AgendaItemRowProps> = ({ item, index, onDelete }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      key={item.id}
      value={item.id}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3"
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab text-text-muted hover:text-text"
      >
        <GripVertical size={16} />
      </div>
      <span className="text-xs text-text-muted w-6">{index + 1}.</span>
      <span className="flex-1 text-sm text-text">{item.description}</span>
      <button
        onClick={() => onDelete(item.id)}
        className="text-text-muted hover:text-red-500"
      >
        <X size={14} />
      </button>
    </Reorder.Item>
  );
};

export function AgendaEditor({ items, onSave, canEdit }: AgendaEditorProps) {
  const [editMode, setEditMode] = useState(false);
  const [localItems, setLocalItems] = useState(items);
  const [newItemText, setNewItemText] = useState('');
  const { staff } = useData();

  useEffect(() => { setLocalItems(items); }, [items]);

  const staffName = (staffId: string): string => {
    const s = staff.find((st) => st.ID === staffId);
    return s ? s.Name : 'Unknown';
  };

  if (!editMode) {
    return (
      <div>
        {items.length === 0 ? (
          <p className="text-sm text-text-muted italic">No agenda items.</p>
        ) : (
          <ol className="list-decimal list-inside space-y-2">
            {items.map((item) => (
              <li key={item.id} className="text-sm text-text">
                <span>{item.description}</span>
                {item.proposed_by && (
                  <span className="text-text-muted text-xs ml-2">
                    ({staffName(item.proposed_by)})
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {canEdit && (
          <button
            onClick={() => setEditMode(true)}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#c96442]"
          >
            <Pencil size={12} /> Edit Agenda
          </button>
        )}
      </div>
    );
  }

  const handleAdd = () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    const newItem: AgendaItem = {
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      meeting_id: items[0]?.meeting_id ?? '',
      sequence: localItems.length + 1,
      description: trimmed,
      proposed_by: '',
      status: 'Pending' as AgendaItem['status'],
    };
    setLocalItems([...localItems, newItem]);
    setNewItemText('');
  };

  const handleSave = async () => {
    const sequenced = localItems.map((item, i) => ({ ...item, sequence: i + 1 }));
    await onSave(sequenced);
    setEditMode(false);
  };

  const handleCancel = () => {
    setLocalItems(items);
    setEditMode(false);
  };

  return (
    <div>
      <Reorder.Group
        axis="y"
        values={localItems}
        onReorder={setLocalItems}
        className="space-y-2"
      >
        {localItems.map((item, idx) => (
          <AgendaItemRow
            key={item.id}
            item={item}
            index={idx}
            onDelete={(id) => setLocalItems(localItems.filter((i) => i.id !== id))}
          />
        ))}
      </Reorder.Group>

      <div className="mt-2 flex gap-2">
        <input
          placeholder="Add agenda item..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm"
        />
        <button onClick={handleAdd} className="p-2 text-[#c96442]">
          <Plus size={16} />
        </button>
      </div>

      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 text-sm border border-border rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-sm bg-[#c96442] text-white rounded-lg flex items-center gap-1"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}
