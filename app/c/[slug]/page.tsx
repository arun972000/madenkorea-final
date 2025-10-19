// app/c/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { CustomerLayout } from '@/components/CustomerLayout';
import { ProductCard } from '@/components/ProductCard';

export const revalidate = 300; // ISR: refresh every 5 minutes

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  // Optional if you add later:
  // hero_banner_url?: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  hero_image_path?: string | null;
  created_at?: string | null;
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

export async function generateStaticParams() {
  const supabase = supabaseServer();
  const { data } = await supabase.from('categories').select('slug').order('slug').limit(50);
  return (data ?? []).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = supabaseServer();
  const { data: category } = await supabase
    .from('categories')
    .select('name, description')
    .eq('slug', params.slug)
    .maybeSingle<CategoryRow>();

  if (!category) {
    return { title: 'Category Not Found | Made Korea' };
  }

  return {
    title: `${category.name} | Made Korea`,
    description: category.description ?? undefined,
    alternates: { canonical: `/c/${params.slug}` },
    openGraph: {
      title: `${category.name} | Made Korea`,
      description: category.description ?? undefined,
      url: `/c/${params.slug}`,
      type: 'website',
    },
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const supabase = supabaseServer();

  // 1) Category lookup
  const { data: category, error: catErr } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', params.slug)
    .maybeSingle<CategoryRow>();

  if (catErr || !category) {
    notFound();
  }

  // 2) Products in this category (published only)
  const { data: products } = await supabase
    .from('products')
    .select(`
      id, slug, name,
      price, currency,
      compare_at_price, sale_price, sale_starts_at, sale_ends_at,
      short_description, volume_ml, net_weight_g, country_of_origin,
      hero_image_path, created_at,
      brands ( name )
    `)
    .eq('category_id', category.id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<ProductRow[]>();

  // 3) Compute public URLs on the server (faster cards)
  const items = (products ?? []).map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));

  return (
    <CustomerLayout>
      {/* Optional banner if you later add categories.hero_banner_url */}
      {/* {category.hero_banner_url && (
        <div className="relative w-full aspect-[21/7] bg-muted mb-8">
          <img src={category.hero_banner_url} alt={category.name} className="w-full h-full object-cover" />
        </div>
      )} */}

      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{category.name}</h1>
          {category.description && (
            <p className="text-lg text-muted-foreground">{category.description}</p>
          )}
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            {items.length} {items.length === 1 ? 'product' : 'products'}
          </p>
          {/* (Optional) Add sort/filter controls later */}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No products found in this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product as any} />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
