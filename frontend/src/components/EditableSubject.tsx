/**
 * EditableSubject Component
 * 
 * Displays the email subject as the ticket title, editable inline.
 * When the agent changes the subject, it:
 * 1. Persists the change to the database via API
 * 2. Dispatches a custom event so ReplyArea uses the updated subject
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil } from 'lucide-react';
import { apiClient } from '@/utils/api';

interface EditableSubjectProps {
  /** The initial subject from the last incoming email */
  initialSubject: string;
  /** Customer ID for persisting changes */
  customerId: string;
  /** Fallback text when no subject is available */
  noSubjectText?: string;
}

/** Custom event name used to communicate subject changes across React islands */
export const SUBJECT_CHANGE_EVENT = 'ticket-subject-changed';

export interface SubjectChangeDetail {
  subject: string;
}

export const EditableSubject: React.FC<EditableSubjectProps> = ({
  initialSubject,
  customerId,
  noSubjectText = '(No Subject)',
}) => {
  const [subject, setSubject] = useState(initialSubject || '');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(subject);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const dispatchSubjectChange = useCallback((newSubject: string) => {
    window.dispatchEvent(
      new CustomEvent<SubjectChangeDetail>(SUBJECT_CHANGE_EVENT, {
        detail: { subject: newSubject },
      })
    );
  }, []);

  const saveSubject = useCallback(async (newSubject: string) => {
    try {
      await apiClient.post(`/emails/updateSubject?customerId=${customerId}`, {
        subject: newSubject,
      });
    } catch (err) {
      console.error('Failed to save subject:', err);
    }
  }, [customerId]);

  const startEditing = () => {
    setEditValue(subject);
    setIsEditing(true);
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed.length > 0 && trimmed !== subject) {
      setSubject(trimmed);
      dispatchSubjectChange(trimmed);
      saveSubject(trimmed);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditValue(subject);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const displaySubject = subject || noSubjectText;

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        maxLength={500}
        className="text-2xl font-bold tracking-tight bg-transparent border-b-2 border-primary outline-none w-full min-w-0 py-0 px-0 leading-tight"
        aria-label="Edit email subject"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="flex items-center gap-2 text-left cursor-pointer hover:opacity-80 transition-opacity min-w-0"
      title="Click to edit subject"
      aria-label={`Subject: ${displaySubject}. Click to edit.`}
    >
      <h1 className="text-2xl font-bold tracking-tight truncate min-w-0">
        {displaySubject}
      </h1>
      <Pencil className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
};
