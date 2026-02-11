/**
 * MacroEditorIsland Component
 *
 * A self-contained macro editor that can be mounted dynamically in Astro pages.
 * Wraps MacroEditor with save/cancel functionality and attachment management.
 */

import React, { useState, useCallback, useRef } from 'react';
import { MacroEditor, type MacroVariable } from '@/components/MacroEditor';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getAttachmentSignedUrl } from '@/utils/attachmentManager';

export interface Attachment {
  id?: string;
  filename: string;
  object_path: string;
  objectURL?: string;
}

interface MacroEditorIslandProps {
  /** Initial macro title */
  initialTitle?: string;
  /** Initial macro content (HTML) */
  initialContent?: string;
  /** Macro ID (null for new macros) */
  macroId?: string | null;
  /** Group ID to save the macro in */
  groupId?: string | null;
  /** Existing attachments for editing */
  initialAttachments?: Attachment[];
  /** Available variables */
  variables?: MacroVariable[];
  /** Callback when save is successful */
  onSave?: (data: {
    id?: string;
    title: string;
    text: string;
    attachments?: Attachment[];
  }) => void;
  /** Callback when cancelled */
  onCancel?: () => void;
  /** Translation strings */
  translations?: {
    save?: string;
    cancel?: string;
    saving?: string;
    addAttachments?: string;
    macroCreated?: string;
    macroCreatedDesc?: string;
    macroUpdated?: string;
    macroUpdatedDesc?: string;
    failedToSave?: string;
    tryAgain?: string;
  };
  /** API client for saving */
  apiClient?: any;
}

export const MacroEditorIsland: React.FC<MacroEditorIslandProps> = ({
  initialTitle = '',
  initialContent = '',
  macroId = null,
  groupId = null,
  initialAttachments = [],
  variables,
  onSave,
  onCancel,
  translations = {},
  apiClient,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deletedFiles, setDeletedFiles] = useState<Attachment[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(initialAttachments);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!macroId;

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSelectedFiles(prev => [...prev, ...Array.from(files)]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleRemoveNewFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveExisting = useCallback((index: number) => {
    const removed = existingAttachments[index];
    if (removed) {
      setDeletedFiles(prev => [...prev, removed]);
      setExistingAttachments(prev => prev.filter((_, i) => i !== index));
    }
  }, [existingAttachments]);

  const handleSave = useCallback(async () => {
    if (!apiClient) {
      toast.error('API client not available');
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();
      
      // Add files
      selectedFiles.forEach(file => {
        formData.append('attachments', file);
      });

      // Add metadata
      if (isEditing) {
        formData.append('macroId', macroId);
        formData.append('deletedAttachments', JSON.stringify(deletedFiles));
        formData.append('oldAttachments', JSON.stringify(existingAttachments));
      } else {
        formData.append('groupId', String(groupId));
      }
      
      formData.append('title', title);
      formData.append('text', content);

      const endpoint = isEditing ? '/macros/updateMacro' : '/macros/createMacro';
      const response = await apiClient.postFormData(endpoint, formData);

      if (!response.success) {
        throw new Error(response.error || 'Failed to save macro');
      }

      toast.success(
        isEditing ? (translations.macroUpdated || 'Macro updated') : (translations.macroCreated || 'Macro created'),
        {
          description: isEditing 
            ? (translations.macroUpdatedDesc || 'The macro has been updated successfully.')
            : (translations.macroCreatedDesc || 'The macro has been created successfully.'),
        }
      );

      onSave?.({
        id: response.data?.id || macroId,
        title: response.data?.title || title,
        text: response.data?.text || content,
        attachments: response.attachments || existingAttachments,
      });
    } catch (error) {
      console.error('[MacroEditorIsland] Failed to save:', error);
      toast.error(translations.failedToSave || 'Failed to save', {
        description: error instanceof Error ? error.message : (translations.tryAgain || 'Please try again.'),
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    apiClient, title, content, macroId, groupId, isEditing, selectedFiles, 
    deletedFiles, existingAttachments, translations, onSave
  ]);

  return (
    <div className="space-y-6">
      <MacroEditor
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={setContent}
        disabled={isSaving}
        variables={variables}
      />

      {/* File Upload Section */}
      <div className="flex items-start gap-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSaving}
        >
          + {translations.addAttachments || 'Add Attachments'}
        </Button>

        {/* File Previews */}
        <div className="flex gap-3 flex-wrap">
          {existingAttachments.map((att, index) => (
            <div key={att.id || att.object_path} className="border rounded p-2 w-32 text-xs flex flex-col gap-1 bg-card">
              <a
                href={att.objectURL || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline truncate"
              >
                {att.filename}
              </a>
              <button
                type="button"
                onClick={() => handleRemoveExisting(index)}
                disabled={isSaving}
                className="self-end text-[10px] text-red-500 hover:text-red-700 font-bold"
              >
                ✕
              </button>
            </div>
          ))}
          {selectedFiles.map((file, index) => {
            const objectURL = URL.createObjectURL(file);
            return (
              <div key={`${file.name}-${index}`} className="border rounded p-2 w-32 text-xs flex flex-col gap-1 bg-card">
                <a
                  href={objectURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline truncate"
                >
                  {file.name}
                </a>
                <button
                  type="button"
                  onClick={() => handleRemoveNewFile(index)}
                  disabled={isSaving}
                  className="self-end text-[10px] text-red-500 hover:text-red-700 font-bold"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
          >
            {translations.cancel || 'Cancel'}
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !title.trim()}
          className="inline-flex items-center"
        >
          {isSaving ? (
            <>
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {translations.saving || 'Saving...'}
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {translations.save || 'Save'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
