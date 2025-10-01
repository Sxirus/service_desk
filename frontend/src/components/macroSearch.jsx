import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * TypeaheadSearch
 * - Real-time search over items by `title`
 * - Shows up to `maxSuggestions` (default 3)
 * - Keyboard support (↑/↓/Enter/Escape)
 * - Accessible ARIA roles (combobox/listbox/option)
 * - No external deps; includes a simple fuzzy ranking (substring + Levenshtein)
 *
 * Props (all JSON-serializable for Astro islands):
 *  - items: Array<{ id: string|number; client_id?: string|number; title: string; text?: string }>
 *  - placeholder?: string
 *  - maxSuggestions?: number (default 3)
 *  - minChars?: number (default 1)
 *  - itemUrlBase?: string (optional; if provided, selecting navigates to `${itemUrlBase}${id}`)
 */
export function TypeaheadSearch({
  items,
  placeholder = "Suchen…",
  maxSuggestions = 3,
  minChars = 1,
  itemUrlBase,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(-1);
  const listboxId = useMemo(() => `listbox-${Math.random().toString(36).slice(2)}`, []);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Debounced input to avoid recomputing on every keystroke
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  // --- Fuzzy search helpers ---
  const norm = (s) => (s || "").toString().trim().toLowerCase();

  const levenshtein = (a, b) => {
    a = norm(a);
    b = norm(b);
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const cb = b.charCodeAt(j - 1);
        const cost = ca === cb ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return dp[m][n];
  };

  const scoreTitle = (q, title) => {
    const qq = norm(q);
    const tt = norm(title);
    if (!qq) return 1;
    if (tt.startsWith(qq)) return 0; // best
    if (tt.includes(qq)) return 0.25;
    const d = levenshtein(qq, tt.slice(0, Math.max(qq.length, 24))); // cap for perf
    const ratio = d / Math.max(qq.length, 1);
    return 0.5 + Math.min(ratio, 1); // 0.5..1.5
  };

  const suggestions = useMemo(() => {
    const q = norm(debouncedQuery);
    if (q.length < minChars) return [];
    const ranked = items
      .map((it) => ({
        item: it,
        score: scoreTitle(q, it.title),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, maxSuggestions)
      .map((r) => r.item);
    return ranked;
  }, [debouncedQuery, items, maxSuggestions, minChars]);

  useEffect(() => {
    setOpen(suggestions.length > 0 && norm(query).length >= minChars);
    setHovered(suggestions.length ? 0 : -1);
  }, [suggestions, query, minChars]);

  const select = (idx) => {
    if (idx < 0 || idx >= suggestions.length) return;
    const sel = suggestions[idx];
    if (itemUrlBase) {
      window.location.href = `${itemUrlBase}${sel.id}`;
    } else {
      // Fallback: write title into input
      setQuery(sel.title);
    }
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHovered((h) => Math.min((h === -1 ? 0 : h) + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHovered((h) => Math.max(h - 1, 0));
        break;
      case "Enter":
        if (open && hovered >= 0) {
          e.preventDefault();
          select(hovered);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (!listRef.current || !inputRef.current) return;
      if (
        !listRef.current.contains(e.target) &&
        !inputRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          className="w-full rounded-2xl border border-gray-300 px-4 py-2 outline-none focus:ring-4 focus:ring-gray-200 shadow-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && hovered >= 0 ? `${listboxId}-opt-${hovered}` : undefined
          }
        />

        {open && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 w-full rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === hovered}
                className={
                  "cursor-pointer px-4 py-2 text-sm " +
                  (i === hovered ? "bg-gray-100" : "hover:bg-gray-50")
                }
                onMouseEnter={() => setHovered(i)}
                onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
                onClick={() => select(i)}
                title={s.title}
              >
                <div className="font-medium truncate">{s.title}</div>
                {s.text ? (
                  <div className="text-gray-500 truncate">{s.text}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Tippen, mit ↑/↓ navigieren, Enter zum Auswählen.
      </p>
    </div>
  );
}

// --- Demo wrapper for canvas preview ---
// You can delete this in your project and only keep the exported TypeaheadSearch above.
const demoItems = [
  { id: 1, client_id: 10, title: "Rechnung August 2025", text: "Kunde ACME GmbH" },
  { id: 2, client_id: 10, title: "Rechnung September 2025", text: "Kunde Globex" },
  { id: 3, client_id: 11, title: "Meeting-Notizen Onboarding", text: "Projekt Phoenix" },
  { id: 4, client_id: 12, title: "Support-Ticket Drucker", text: "Büro Süd" },
  { id: 5, client_id: 12, title: "Budget Q4 Planung", text: "Marketing" },
  { id: 6, client_id: 12, title: "Projekt Roadmap 2026", text: "Engineering" },
  { id: 7, client_id: 10, title: "Angebot Website-Relaunch", text: "Design" },
];

export default function DemoTypeahead() {
  return (
    <div className="min-h-[60vh] flex items-start justify-center p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">Typeahead Suche – Demo</h1>
        <TypeaheadSearch items={demoItems} itemUrlBase="/items/" />
        <div className="mt-6 text-sm text-gray-600">
          <p>
            Diese Demo navigiert bei Auswahl zu <code>/items/&lt;id&gt;</code>.
            In deinem Projekt kannst du <code>itemUrlBase</code> auf die gewünschte
            Route setzen.
          </p>
        </div>
      </div>
    </div>
  );
}
