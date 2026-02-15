/**
 * SettingsSignatureEditor Component
 *
 * Rich text editor for email signature settings.
 * Uses the shared RichTextEditor (TipTap) component for formatting.
 * Handles its own save logic via apiClient.
 */

import React, { useState, useCallback } from 'react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { toast } from 'sonner';
import { apiClient } from '@/utils/api';

interface SettingsSignatureEditorProps {
  /** Initial HTML content of the signature */
  initialContent: string;
  /** Translated strings for UI labels and messages */
  translations: {
    label: string;
    placeholder: string;
    hint: string;
    save: string;
    saving: string;
    invalidSignature: string;
    changesSaved: string;
    updatedSuccessfully: string;
    updatedSanitized: string;
    failedToSave: string;
    unexpectedError: string;
  };
}

export default function SettingsSignatureEditor({
  initialContent,
  translations: t,
}: SettingsSignatureEditorProps) {
  const [html, setHtml] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const handleContentChange = useCallback((newHtml: string) => {
    setHtml(newHtml);
  }, []);

  const handleSave = async () => {
    // Basic length validation (HTML content can be longer than plain text)
    if (html.length > 50000) {
      toast.error(t.invalidSignature, {
        description: 'Signature is too long',
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await apiClient.post('/settings/updateSignature', {
        signature: html,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to save signature');
      }

      toast.success(t.changesSaved, {
        description: t.updatedSuccessfully,
      });
    } catch (error) {
      console.error('[SettingsSignatureEditor] Failed to save signature:', error);
      toast.error(t.failedToSave, {
        description: error instanceof Error ? error.message : t.unexpectedError,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">
        {t.label}
      </label>
      <RichTextEditor
        content={initialContent}
        onContentChange={handleContentChange}
        placeholder={t.placeholder}
        className="min-h-[150px]"
      />
      <p className="text-xs text-muted-foreground">
        {t.hint}
      </p>

      {/* Save Button */}
      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          {isSaving ? (
            <>
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {t.saving}
            </>
          ) : (
            <>
              <svg
                className="mr-2 h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t.save}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
