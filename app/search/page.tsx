// app/search/page.tsx
import { CustomerLayout } from '@/components/CustomerLayout';
import { ProductCard } from '@/components/ProductCard';
import { createClient } from '@supabase/supabase-js';

type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  hero_image_path?: string | null;
  hero_image_url?: string | null;
  brands?: { name?: string | null } | null;
};

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const supabase = supabaseServer();
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl ?? null;
}

async function searchProducts(query: string): Promise<CardProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = supabaseServer();
  const search = `%${trimmed}%`;

  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id, slug, name,
      price, currency,
      compare_at_price, sale_price, sale_starts_at, sale_ends_at,
      is_featured, is_trending, new_until,
      short_description, volume_ml, net_weight_g, country_of_origin,
      hero_image_path,
      brands ( name )
    `
    )
    .eq('is_published', true)
    .or(`name.ilike.${search},short_description.ilike.${search}`)
    .limit(40);

  if (error) {
    console.error('searchProducts error', error);
    return [];
  }

  return (data ?? []).map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));
}

async function getSuggestedProducts(limit = 8): Promise<CardProduct[]> {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id, slug, name,
      price, currency,
      compare_at_price, sale_price, sale_starts_at, sale_ends_at,
      is_featured, is_trending, new_until,
      short_description, volume_ml, net_weight_g, country_of_origin,
      hero_image_path,
      brands ( name )
    `
    )
    .eq('is_published', true)
    .order('is_featured', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getSuggestedProducts error', error);
    return [];
  }

  return (data ?? []).map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = searchParams.q ?? '';
  const searchResults = await searchProducts(query);
  const hasNoResults = !!query && searchResults.length === 0;
  const suggestedProducts = hasNoResults
    ? await getSuggestedProducts(8)
    : [];

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Search Results</h1>
          {query && (
            <p className="text-muted-foreground">
              {hasNoResults
                ? `0 results for "${query}"`
                : `${searchResults.length} results for "${query}"`}
            </p>
          )}
        </div>

        {!query ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Enter a search term to find products
            </p>
          </div>
        ) : hasNoResults ? (
          <div className="py-12 space-y-8">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">
                No products found for "{query}". Try a different search term.
              </p>
              <p className="font-medium">
                You might like these products instead:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {suggestedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {searchResults.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
