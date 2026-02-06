/**
 * RichTextEditor Component
 *
 * Tiptap-based rich text editor with formatting toolbar and emoji support.
 * Outputs HTML content for email composition.
 *
 * Features:
 * - Bold, Italic, Underline, Strikethrough
 * - Ordered & Unordered lists
 * - Links
 * - Emoji picker
 * - Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+U, etc.)
 */

import React, { useCallback, useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EmojiPicker } from '@/components/EmojiPicker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

// --- Toolbar button ---
interface ToolbarBtnProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  ariaLabel: string;
  children: React.ReactNode;
}

const ToolbarBtn: React.FC<ToolbarBtnProps> = ({
  onClick,
  isActive,
  disabled,
  title,
  ariaLabel,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel}
    className={`h-7 w-7 rounded flex items-center justify-center text-xs transition-colors
      ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-foreground/70'}
      disabled:opacity-40 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

// --- Separator ---
const ToolbarSep = () => <div className="w-px h-5 bg-border mx-0.5" />;

// --- Props ---
export interface RichTextEditorProps {
  /** HTML content value */
  content: string;
  /** Called when content changes — returns HTML string */
  onContentChange: (html: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable editing */
  disabled?: boolean;
  /** Extra class for the wrapper */
  className?: string;
  /** ID for label association */
  id?: string;
}

/** Methods exposed via ref */
export interface RichTextEditorRef {
  /** Insert HTML content at the current cursor position */
  insertContent: (html: string) => void;
  /** Focus the editor */
  focus: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>((
  {
    content,
    onContentChange,
    placeholder = 'Type your reply…',
    disabled = false,
    className = '',
    id,
  },
  ref
) => {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable heading since we don't need it for emails
        heading: false,
        // Keep these from StarterKit
        bold: {},
        italic: {},
        strike: {},
        bulletList: {},
        orderedList: {},
        listItem: {},
        blockquote: {},
        horizontalRule: {},
        hardBreak: {},
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
          class: 'text-blue-600 underline',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      onContentChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-0 h-full px-3 py-2 overflow-y-auto',
        ...(id ? { id } : {}),
      },
    },
  });

  // Sync disabled state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  // Allow external content reset (e.g. after sending)
  useEffect(() => {
    if (editor && content === '' && editor.getHTML() !== '<p></p>') {
      editor.commands.clearContent();
    }
  }, [content, editor]);

  // Expose imperative methods for parent components (e.g. macro insertion)
  useImperativeHandle(ref, () => ({
    insertContent: (html: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(html).run();
    },
    focus: () => {
      editor?.commands.focus();
    },
  }), [editor]);

  const insertEmoji = useCallback(
    (emoji: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(emoji).run();
    },
    [editor]
  );

  // --- Link popover state ---
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  const openLinkPopover = useCallback(() => {
    if (!editor) return;
    const existing = editor.getAttributes('link').href || '';
    setLinkUrl(existing);
    setLinkOpen(true);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
    setLinkUrl('');
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`flex flex-col border border-input rounded-md bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden ${className}`}
    >
      {/* Formatting Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30 flex-wrap shrink-0">
        {/* Bold */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          disabled={disabled}
          title="Bold (Ctrl+B)"
          ariaLabel="Toggle bold"
        >
          <strong>B</strong>
        </ToolbarBtn>

        {/* Italic */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          disabled={disabled}
          title="Italic (Ctrl+I)"
          ariaLabel="Toggle italic"
        >
          <em>I</em>
        </ToolbarBtn>

        {/* Underline */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          disabled={disabled}
          title="Underline (Ctrl+U)"
          ariaLabel="Toggle underline"
        >
          <span className="underline">U</span>
        </ToolbarBtn>

        {/* Strikethrough */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          disabled={disabled}
          title="Strikethrough"
          ariaLabel="Toggle strikethrough"
        >
          <span className="line-through">S</span>
        </ToolbarBtn>

        <ToolbarSep />

        {/* Bullet List */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          disabled={disabled}
          title="Bullet list"
          ariaLabel="Toggle bullet list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="3" cy="6" r="1" fill="currentColor" />
            <circle cx="3" cy="12" r="1" fill="currentColor" />
            <circle cx="3" cy="18" r="1" fill="currentColor" />
          </svg>
        </ToolbarBtn>

        {/* Ordered List */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          disabled={disabled}
          title="Numbered list"
          ariaLabel="Toggle numbered list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <text x="1" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
            <text x="1" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
            <text x="1" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
          </svg>
        </ToolbarBtn>

        <ToolbarSep />

        {/* Blockquote */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          disabled={disabled}
          title="Quote"
          ariaLabel="Toggle blockquote"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
          </svg>
        </ToolbarBtn>

        {/* Link */}
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={openLinkPopover}
              disabled={disabled}
              title="Insert link"
              aria-label="Insert or edit link"
              className={`h-7 w-7 rounded flex items-center justify-center text-xs transition-colors
                ${editor.isActive('link') ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-foreground/70'}
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" side="top" align="start" sideOffset={8}>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-foreground">URL</label>
              <input
                ref={linkInputRef}
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                  if (e.key === 'Escape') { setLinkOpen(false); }
                }}
                placeholder="https://example.com"
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex items-center gap-2 justify-end">
                {editor.isActive('link') && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeLink}
                    className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                  >
                    Remove
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setLinkOpen(false); setLinkUrl(''); }}
                  className="h-7 px-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={applyLink}
                  className="h-7 px-3 text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Horizontal Rule */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          disabled={disabled}
          title="Horizontal line"
          ariaLabel="Insert horizontal line"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </ToolbarBtn>

        <ToolbarSep />

        {/* Emoji Picker */}
        <EmojiPicker onEmojiSelect={insertEmoji} disabled={disabled} />

        {/* Undo / Redo on the right */}
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarBtn
            onClick={() => editor.chain().focus().undo().run()}
            disabled={disabled || !editor.can().undo()}
            title="Undo (Ctrl+Z)"
            ariaLabel="Undo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().redo().run()}
            disabled={disabled || !editor.can().redo()}
            title="Redo (Ctrl+Shift+Z)"
            ariaLabel="Redo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </ToolbarBtn>
        </div>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} className="flex-1 min-h-0 overflow-y-auto" />
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';
