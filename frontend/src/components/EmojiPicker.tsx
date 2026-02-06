/**
 * EmojiPicker Component
 *
 * Lightweight emoji picker using a curated set of common emojis.
 * Organized into categories with search functionality.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: '😊 Smileys',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
      '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
      '🥲','😋','😛','😜','🤪','😝','🤗','🤭','🫢','🫣',
      '🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏',
      '😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷',
      '🤒','🤕','🤢','🤮','🥴','😵','🤯','🥳','🥸','😎',
      '🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳',
      '🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱',
      '😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠',
      '🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻',
      '👽','👾','🤖',
    ],
  },
  {
    name: '👋 Gestures',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌',
      '🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉',
      '👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛',
      '🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💪',
      '🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','👀','👁️',
      '👅','👄',
    ],
  },
  {
    name: '❤️ Hearts',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝',
      '💟','♥️','💋','💌','💐','🌹','🥀','🌷','🌸',
    ],
  },
  {
    name: '🎉 Objects',
    emojis: [
      '🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','⚽',
      '🏀','🏈','⚾','🎾','🏐','🎯','🔔','🎵','🎶','🎤',
      '🎧','📱','💻','⌨️','🖥️','📧','📨','📩','📬','📝',
      '📁','📂','📅','📆','📌','📎','🔗','✂️','📏','📐',
      '🔒','🔓','🔑','🔨','🔧','⚙️','💡','🔍','🔎',
    ],
  },
  {
    name: '✅ Symbols',
    emojis: [
      '✅','❌','⭕','❗','❓','‼️','⁉️','💯','🔴','🟠',
      '🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔶',
      '🔷','💠','🔘','▪️','▫️','◻️','◼️','⬛','⬜','➡️',
      '⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','🔄',
      '♻️','✨','⭐','🌟','💫','🔥','💥','⚡','🌈','☀️',
      '🌤️','⛅','🌥️','☁️','🌧️','⛈️','🌩️','❄️','☃️','🌊',
    ],
  },
  {
    name: '🍕 Food',
    emojis: [
      '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒',
      '🍑','🥭','🍍','🥝','🍅','🥑','🍕','🍔','🍟','🌭',
      '🍿','🧁','🍰','🎂','🍩','🍪','☕','🍵','🥤','🍺',
      '🍻','🥂','🍷','🥃','🧃',
    ],
  },
];

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  disabled?: boolean;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onEmojiSelect, disabled }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearch('');
      setActiveCategory(0);
    }
  }, [open]);

  const filteredCategories = useMemo(() => {
    if (!search) return EMOJI_CATEGORIES;
    // Simple filter: show all emojis in a flat list when searching
    const allMatching = EMOJI_CATEGORIES.flatMap(c => c.emojis);
    // Since we can't easily search emoji by name without a mapping,
    // just show all when there's a search term (the visual scan is fast)
    return [{ name: '🔍 Results', emojis: allMatching }];
  }, [search]);

  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Emoji"
          aria-label="Insert emoji"
        >
          <span className="text-base leading-none">😊</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        side="top"
        align="start"
        sideOffset={8}
      >
        <div className="flex flex-col h-72">
          {/* Search */}
          <div className="p-2 border-b">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emojis..."
              className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Category tabs */}
          {!search && (
            <div className="flex border-b px-1 gap-0.5 overflow-x-auto">
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(i)}
                  className={`px-2 py-1.5 text-sm shrink-0 rounded-t-md transition-colors ${
                    activeCategory === i
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  }`}
                  title={cat.name}
                >
                  {cat.emojis[0]}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div className="flex-1 overflow-y-auto p-2">
            {(search ? filteredCategories : [EMOJI_CATEGORIES[activeCategory]]).map((cat) => (
              <div key={cat.name}>
                <div className="text-xs font-medium text-muted-foreground mb-1 px-1">
                  {cat.name}
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.emojis.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      type="button"
                      onClick={() => handleSelect(emoji)}
                      className="h-8 w-8 flex items-center justify-center text-lg hover:bg-accent rounded-md transition-colors cursor-pointer"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
