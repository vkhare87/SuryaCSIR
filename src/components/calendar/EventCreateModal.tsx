import { X } from 'lucide-react';
import { EventForm, type EventFormValues } from './EventForm';
import type { DivisionInfo } from '../../types';

interface EventCreateModalProps {
  open: boolean;
  divisions: DivisionInfo[];
  defaultDivisionCode: string;
  onSubmit: (values: EventFormValues) => Promise<void>;
  onClose: () => void;
}

export function EventCreateModal({
  open,
  divisions,
  defaultDivisionCode,
  onSubmit,
  onClose,
}: EventCreateModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-text">New Event</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:bg-surface-hover p-1 rounded-md"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <EventForm
            divisions={divisions}
            defaultDivisionCode={defaultDivisionCode}
            submitLabel="Create"
            onSubmit={async (values) => {
              await onSubmit(values);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
