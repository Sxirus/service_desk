import { interpreter } from "@/utils/macroInterpreter";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from 'react-i18next';

export function MacroSearch({
  items,     // Macros: { id, client_id, title, text, group_id|null }
  groups,    // Groups: { id, client_id, name, group_id|null (parent) }
  placeholder,
  maxSuggestions = 3,
  minChars = 1,
  eventName = "appendToAstroInput",
  customerID,
  ctx
}) {
  const { t } = useTranslation('manage');
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(-1);
  const [currentGroupId, setCurrentGroupId] = useState(null); // null = Root
  const listboxId = useMemo(() => `listbox-${customerID}`, [customerID]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const effectivePlaceholder = placeholder || t('macros.search.placeholder');

  // ---- utils ----
  const norm = (s) => (s || "").toString().trim().toLowerCase();

  // Strip HTML tags for plain text preview
  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  };

  const levenshtein = (a, b) => {
    a = norm(a); b = norm(b);
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  };

  const onBlur = () => {
  setFocused(false);
  setOpen(false); // beim Verlassen schließen
  };  

  const scoreText = (q, title) => {
    const qq = norm(q);
    const tt = norm(title);
    if (!qq) return 0;
    if (tt.startsWith(qq)) return 0;
    if (tt.includes(qq)) return 0.25;
    const d = levenshtein(qq, tt.slice(0, Math.max(qq.length, 24)));
    const ratio = d / Math.max(qq.length, 1);
    return 0.5 + Math.min(ratio, 1);
  };

  // Map für schnelle Parent-Lookups
  const groupById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach(g => m.set(g.id, g));
    return m;
  }, [groups]);

  // ---- Datenaufbereitung für Browser/Search ----
  // Ein Eintrag ist { type: 'group'|'macro'|'back', id, title, subtitle?, payload }
  const makeEntriesForGroup = useCallback((groupId) => {
    const childGroups = (groups || []).filter(g => (g.group_id ?? null) === groupId)
      .map(g => ({ type: 'group', id: `g-${g.id}`, title: g.name, payload: g }));

    const childMacros = (items || []).filter(m => (m.group_id ?? null) === groupId)
      .map(m => ({
        type: 'macro',
        id: `m-${m.id}`,
        title: m.title,
        subtitle: stripHtml(m.text),
        payload: m
      }));

    // Gruppen zuerst
    return [...childGroups, ...childMacros];
  }, [groups, items]);

  // Volltext-Suche über alle Gruppen & Makros
  const makeSearchEntries = useCallback((q) => {
    const qn = norm(q);
    const macroMatches = (items || []).map(m => ({
      type: 'macro',
      id: `m-${m.id}`,
      title: m.title,
      subtitle: stripHtml(m.text),
      payload: m,
      // scoring darf Titel + Text berücksichtigen (use original text with HTML for better search)
      score: scoreText(qn, (m.title || "") + " " + stripHtml(m.text))
    }));

    return macroMatches
      .sort((a, b) => a.score - b.score)
      .slice(0, maxSuggestions);
  }, [items, maxSuggestions]);

  // Wenn wir in einer Untergruppe sind → optional "zurück"
  const makeBackEntry = useCallback(() => {
    if (currentGroupId == null) return [];
    const parentId = groupById.get(currentGroupId)?.group_id ?? null;
    const parentName = parentId == null ? t('macros.search.allRoot') : (groupById.get(parentId)?.name || t('macros.search.back'));
    return [{
      type: 'back',
      id: `back-${currentGroupId}`,
      title: `⬅︎ ${parentName}`,
      payload: { parentId }
    }];
  }, [currentGroupId, groupById, t]);

  // Debounce für Suche
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  // Vorschläge berechnen:
  const suggestions = useMemo(() => {
  const q = norm(debouncedQuery);
  if (!open) return [];
  if (q.length >= minChars) {
    // 🔑 Suche: nur Makros
    return makeSearchEntries(q);
  }
  // 🔑 Browse: Gruppen + Makros der aktuellen Ebene (Gruppen zuerst)
  return [...makeBackEntry(), ...makeEntriesForGroup(currentGroupId)];
}, [debouncedQuery, minChars, open, currentGroupId, makeEntriesForGroup, makeSearchEntries, makeBackEntry]);

  useEffect(() => {
  if (!focused) {
    setOpen(false);
    setHovered(-1);
    setQuery("");
    return;
  }
  const q = norm(query);
  const shouldOpen = q.length >= minChars ? suggestions.length > 0 : true; // bei Fokus & leerem Feld: browse öffnen
  setOpen(shouldOpen);
  setHovered(suggestions.length ? 0 : -1);
}, [focused, suggestions, query, minChars]);

  const fireMacro = useCallback((macro) => {
    let text = macro.text && String(macro.text).length > 0 ? String(macro.text) : macro.title;
    text = interpreter(text, ctx);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { text } }));
  }, [ctx, eventName]);

  const select = useCallback((idx) => {
    const entry = suggestions[idx];
    if (!entry) return;

    if (entry.type === 'back') {
      setCurrentGroupId(entry.payload.parentId ?? null);
      setHovered(-1);
      setOpen(true);
      return;
    }

    if (entry.type === 'group') {
      setCurrentGroupId(entry.payload.id); // in die Gruppe hinein
      setHovered(-1);
      setOpen(true);
      return;
    }

    if (entry.type === 'macro') {
      fireMacro(entry.payload);
      setOpen(false);
      setQuery("");
      setHovered(-1);
      inputRef.current?.blur?.();
      return;
    }
  }, [suggestions, fireMacro]);

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHovered(h => Math.min((h === -1 ? 0 : h) + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHovered(h => Math.max(h - 1, 0));
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

  // Außenklick schließt
  useEffect(() => {
    const onClick = (e) => {
      if (!listRef.current || !inputRef.current) return;
      if (!listRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Fokus mit leerem Feld → Browsing öffnen
  const onFocus = () => {
    if (norm(query).length === 0) {
      setOpen(true);
      setFocused(true);
      setHovered( (makeBackEntry().length ? 0 : 0) );
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          className="w-full bg-white cursor-pointer rounded-2xl border border-gray-300 px-4 py-2 outline-none focus:ring-4 focus:ring-gray-200 shadow-sm"
          placeholder={effectivePlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && hovered >= 0 ? `${listboxId}-opt-${hovered}` : undefined}
        />

        {open && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 w-full rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden max-h-80 overflow-y-auto"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === hovered}
                className={
                  "cursor-pointer px-4 py-2 text-sm flex flex-col gap-0.5 " +
                  (i === hovered ? "bg-gray-100" : "hover:bg-gray-50")
                }
                onMouseEnter={() => setHovered(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(i)}
                title={s.title}
              >
                <div className="font-medium truncate">
                  {s.type === 'group' ? "📁 " : s.type === 'back' ? "⬅︎ " : "📄 "}
                  {s.title}
                </div>
                {s.subtitle ? (
                  <div className="text-gray-500 truncate">{s.subtitle}</div>
                ) : null}
              </li>
            ))}
            {suggestions.length === 0 && (
              <li className="px-4 py-2 text-sm text-gray-500">{t('macros.search.noResults')}</li>
            )}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {t('macros.search.helpText')}
      </p>
    </div>
  );
}
