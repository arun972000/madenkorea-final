'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@supabase/supabase-js';

interface SearchSuggestion {
  type: 'product';
  id: string;
  title: string;
  image?: string;
  url: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function storagePublicUrl(path?: string | null) {
  if (!path) return undefined;
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl || undefined;
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
  const q = query.trim();
  if (q.length < 2) {
    setSuggestions([]);
    setIsOpen(false);
    return;
  }

  let cancelled = false;
  const debounce = setTimeout(async () => {
    const next: SearchSuggestion[] = [];

    // Call the RPC; cfg: 'simple' to match your search_tsv
    const { data, error } = await supabase.rpc('search_products_tsv', {
      q,
      lim: 8,
      cfg: 'simple', // or 'english' if that's how the vector was built
    });

    if (error) {
      console.error('search rpc error', error);
    }

    if (!cancelled && data?.length) {
      data.forEach((p: any) => {
        const { data: img } = supabase.storage
          .from('product-media')
          .getPublicUrl(p.hero_image_path);
        next.push({
          type: 'product',
          id: p.id,
          title: p.name,
          image: img?.publicUrl,
          url: `/products/${p.slug}`,
        });
      });
    }

    if (!cancelled) {
      setSuggestions(next);
      setIsOpen(next.length > 0);
      setSelectedIndex(-1);
    }
  }, 220);

  return () => {
    cancelled = true;
    clearTimeout(debounce);
  };
}, [query]);


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) handleSelect(suggestions[selectedIndex]);
      else handleSearch();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (s: SearchSuggestion) => {
    router.push(s.url);
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

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const highlightMatch = (text: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${escapeRegExp(query.trim())})`, 'gi');
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
          placeholder="Search products..."
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
            {suggestions.map((s, index) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left',
                  selectedIndex === index && 'bg-muted'
                )}
              >
                {s.image ? (
                  <img src={s.image} alt={s.title} className="w-10 h-10 object-cover rounded" />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-muted rounded">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{highlightMatch(s.title)}</div>
                  <div className="text-xs text-muted-foreground capitalize">product</div>
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
