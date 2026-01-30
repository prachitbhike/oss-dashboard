import { useState, useMemo } from 'react';

interface UseSearchOptions<T> {
  items: T[];
  searchFields: (keyof T)[];
}

interface UseSearchResult<T> {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredItems: T[];
  isSearching: boolean;
  hasResults: boolean;
}

export function useSearch<T>({
  items,
  searchFields,
}: UseSearchOptions<T>): UseSearchResult<T> {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }

    const query = searchQuery.toLowerCase().trim();

    return items.filter((item) =>
      searchFields.some((field) => {
        const value = item[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(query);
        }
        return false;
      })
    );
  }, [items, searchFields, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const hasResults = filteredItems.length > 0;

  return {
    searchQuery,
    setSearchQuery,
    filteredItems,
    isSearching,
    hasResults,
  };
}
