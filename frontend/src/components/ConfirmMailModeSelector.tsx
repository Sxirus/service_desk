/**
 * ConfirmMailModeSelector Component
 *
 * Radio group for selecting when confirmation emails should be sent.
 * Three modes: every email, new tickets only, or disabled.
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/utils/api';

export type ConfirmMailMode = 'all' | 'new_only' | 'disabled';

interface ConfirmMailModeSelectorProps {
  /** Current mode from the database */
  initialMode: ConfirmMailMode;
  /** Translated UI strings */
  translations: {
    title: string;
    description: string;
    modeAll: string;
    modeAllDescription: string;
    modeNewOnly: string;
    modeNewOnlyDescription: string;
    modeDisabled: string;
    modeDisabledDescription: string;
    changesSaved: string;
    modeSaved: string;
    failedToSave: string;
    unexpectedError: string;
  };
}

const MODES: { value: ConfirmMailMode; labelKey: 'modeAll' | 'modeNewOnly' | 'modeDisabled'; descKey: 'modeAllDescription' | 'modeNewOnlyDescription' | 'modeDisabledDescription' }[] = [
  { value: 'all', labelKey: 'modeAll', descKey: 'modeAllDescription' },
  { value: 'new_only', labelKey: 'modeNewOnly', descKey: 'modeNewOnlyDescription' },
  { value: 'disabled', labelKey: 'modeDisabled', descKey: 'modeDisabledDescription' },
];

export default function ConfirmMailModeSelector({
  initialMode,
  translations: t,
}: ConfirmMailModeSelectorProps) {
  const [mode, setMode] = useState<ConfirmMailMode>(initialMode);
  const [saving, setSaving] = useState(false);

  const handleChange = async (newMode: ConfirmMailMode) => {
    if (newMode === mode || saving) return;

    const previousMode = mode;
    setMode(newMode);
    setSaving(true);

    try {
      const response = await apiClient.post('/settings/updateConfirmMailMode', {
        mode: newMode,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to save');
      }

      toast.success(t.changesSaved, {
        description: t.modeSaved,
      });
    } catch (error) {
      console.error('[ConfirmMailModeSelector] Failed to save:', error);
      setMode(previousMode); // revert on error
      toast.error(t.failedToSave, {
        description: error instanceof Error ? error.message : t.unexpectedError,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">{t.title}</h4>
        <p className="text-xs text-muted-foreground">{t.description}</p>
      </div>

      <div className="space-y-2">
        {MODES.map(({ value, labelKey, descKey }) => (
          <label
            key={value}
            className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
              mode === value
                ? 'border-primary bg-primary/5'
                : 'border-input hover:bg-accent/50'
            } ${saving ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <input
              type="radio"
              name="confirmMailMode"
              value={value}
              checked={mode === value}
              onChange={() => handleChange(value)}
              disabled={saving}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="space-y-0.5">
              <span className="text-sm font-medium">{t[labelKey]}</span>
              <p className="text-xs text-muted-foreground">{t[descKey]}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
