import { useState, useEffect, useRef } from "react";
import { apiClient } from "@/utils/api";

export type SearchResults = {
  customers: { id: number; name: string }[];
  emails: { email_address: string; customer_id: number; customer_name: string }[];
  employees: { id: number; name: string; avatar_url: string | null }[];
  tickets: { id: number; subject: string; customer_id: number; status: string }[];
};

const EMPTY_RESULTS: SearchResults = {
  customers: [],
  emails: [],
  employees: [],
  tickets: [],
};

export function useSearch(query: string, debounceMs = 300) {
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    // Clear results for short queries
    if (trimmed.length < 2) {
      setResults(EMPTY_RESULTS);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await apiClient.get(
          `/search?q=${encodeURIComponent(trimmed)}`
        );

        // Don't update if this request was aborted
        if (controller.signal.aborted) return;

        if (response.success) {
          setResults(response.data);
        } else {
          setResults(EMPTY_RESULTS);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Search failed");
        setResults(EMPTY_RESULTS);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, debounceMs]);

  return { results, isLoading, error };
}
