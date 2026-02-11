/**
 * MacroEditor Component
 *
 * Rich text editor for creating/editing macros with variable insertion support.
 * Uses the RichTextEditor (TipTap) component for formatting and outputs HTML.
 */

import React, { useRef, useCallback } from 'react';
import { RichTextEditor, type RichTextEditorRef } from '@/components/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export interface MacroVariable {
  name: string;
  text: string;
  shopify?: boolean;
}

interface MacroEditorProps {
  /** Macro title value */
  title: string;
  /** Called when title changes */
  onTitleChange: (title: string) => void;
  /** HTML content for the macro text */
  content: string;
  /** Called when content changes - returns HTML string */
  onContentChange: (html: string) => void;
  /** Placeholder text for the editor */
  placeholder?: string;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Available variables that can be inserted */
  variables?: MacroVariable[];
  /** Label for the title field */
  titleLabel?: string;
  /** Label for the content field */
  contentLabel?: string;
  /** Helper text for the title field */
  titleHelper?: string;
  /** Helper text for the content field */
  contentHelper?: string;
}

const DEFAULT_VARIABLES: MacroVariable[] = [
  { name: 'Customer ID', text: '{customerID}', shopify: false },
  { name: 'Employee Name', text: '{employeeName}', shopify: false },
  { name: 'Full Customer Name', text: '{customerFullName}', shopify: false },
  { name: 'Customer First Name', text: '{customerFirstName}', shopify: false },
  { name: 'Customer Last Name', text: '{customerLastName}', shopify: false },
  { name: 'Customer Email Address', text: '{customerEmail}', shopify: false },
  { name: 'Last Order Number (Shopify)', text: '{shopifyLastOrderNumber}', shopify: true },
];

export const MacroEditor: React.FC<MacroEditorProps> = ({
  title,
  onTitleChange,
  content,
  onContentChange,
  placeholder = 'Enter your macro text here...',
  disabled = false,
  variables = DEFAULT_VARIABLES,
  titleLabel = 'Title',
  contentLabel = 'Macro Text',
  titleHelper = 'This is the title of the macro.',
  contentHelper = 'This is the text of the macro.',
}) => {
  const editorRef = useRef<RichTextEditorRef>(null);

  const insertVariable = useCallback((variableText: string) => {
    if (editorRef.current) {
      // Insert variable as plain text (not HTML) so macroInterpreter can process it correctly
      editorRef.current.insertContent(variableText);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Title Field */}
      <div className="space-y-2">
        <Label htmlFor="macro-title-input">{titleLabel}</Label>
        <Input
          id="macro-title-input"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Enter your title here..."
          disabled={disabled}
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">{titleHelper}</p>
      </div>

      {/* Rich Text Editor for Macro Content */}
      <div className="space-y-2">
        <Label>{contentLabel}</Label>
        <RichTextEditor
          ref={editorRef}
          content={content}
          onContentChange={onContentChange}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[200px]"
        />
        <p className="text-xs text-muted-foreground">{contentHelper}</p>
      </div>

      {/* Variables Section */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold leading-none tracking-tight">
              Variables
            </h3>
            <p className="text-sm text-muted-foreground">
              Click to insert variables into the macro text
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {variables.map((variable) => (
              <Button
                key={variable.text}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => insertVariable(variable.text)}
                disabled={disabled}
                className="text-xs"
                title={`${variable.name}${variable.shopify ? ' (Shopify)' : ''}`}
              >
                {variable.name}
                <span className="ml-1.5 text-muted-foreground">{variable.text}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
