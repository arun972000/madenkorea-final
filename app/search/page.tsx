'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CustomerLayout } from '@/components/CustomerLayout';
import { ProductCard } from '@/components/ProductCard';
import { mockProducts } from '@/lib/mock-data';

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const searchResults = query
    ? mockProducts.filter(p => {
        const search = query.toLowerCase();
        return (
          p.status === 'active' &&
          (p.title.toLowerCase().includes(search) ||
           p.description.toLowerCase().includes(search) ||
           p.brand_name?.toLowerCase().includes(search))
        );
      })
    : [];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Search Results</h1>
        {query && (
          <p className="text-muted-foreground">
            {searchResults.length} results for "{query}"
          </p>
        )}
      </div>

      {!query ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Enter a search term to find products</p>
        </div>
      ) : searchResults.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No products found for "{query}". Try a different search term.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {searchResults.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <Suspense fallback={<div>Loading...</div>}>
          <SearchResults />
        </Suspense>
      </div>
    </CustomerLayout>
  );
}
