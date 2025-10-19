'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Package, Tag, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { mockProducts, mockCategories, mockBrands } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface SearchSuggestion {
  type: 'product' | 'category' | 'brand';
  id: string;
  title: string;
  image?: string;
  url: string;
}

export function SearchAutocomplete() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const searchTerm = query.toLowerCase();
    const results: SearchSuggestion[] = [];

    const matchedProducts = mockProducts
      .filter(p =>
        p.status === 'active' &&
        (p.title.toLowerCase().includes(searchTerm) ||
         p.description.toLowerCase().includes(searchTerm))
      )
      .slice(0, 5)
      .map(p => ({
        type: 'product' as const,
        id: p.id,
        title: p.title,
        image: p.thumbnail,
        url: `/p/${p.handle}`,
      }));

    const matchedCategories = mockCategories
      .filter(c => c.name.toLowerCase().includes(searchTerm))
      .slice(0, 3)
      .map(c => ({
        type: 'category' as const,
        id: c.id,
        title: c.name,
        url: `/c/${c.slug}`,
      }));

    const matchedBrands = mockBrands
      .filter(b => b.name.toLowerCase().includes(searchTerm))
      .slice(0, 3)
      .map(b => ({
        type: 'brand' as const,
        id: b.id,
        title: b.name,
        image: b.logo,
        url: `/brand/${b.slug}`,
      }));

    results.push(...matchedProducts, ...matchedCategories, ...matchedBrands);
    setSuggestions(results);
    setIsOpen(results.length > 0);
    setSelectedIndex(-1);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else {
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    router.push(suggestion.url);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'product':
        return <Package className="h-4 w-4 text-muted-foreground" />;
      case 'category':
        return <Tag className="h-4 w-4 text-muted-foreground" />;
      case 'brand':
        return <Sparkles className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Search className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const highlightMatch = (text: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.trim()})`, 'gi');
    const parts = text.split(regex);

    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-200 text-foreground font-semibold">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder="Search products, brands, categories..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          className="pl-10 pr-4"
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
          <div className="p-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.id}`}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left',
                  selectedIndex === index && 'bg-muted'
                )}
              >
                {suggestion.image ? (
                  <img
                    src={suggestion.image}
                    alt={suggestion.title}
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-muted rounded">
                    {getIcon(suggestion.type)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {highlightMatch(suggestion.title)}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {suggestion.type}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {query.trim() && (
            <div className="border-t p-2">
              <button
                onClick={handleSearch}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
              >
                <Search className="h-4 w-4" />
                <span>
                  Search for <strong>"{query}"</strong>
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
