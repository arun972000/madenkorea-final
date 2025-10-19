// app/brands/[slug]/page.tsx
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { CustomerLayout } from '@/components/CustomerLayout';
import { ProductCard } from '@/components/ProductCard';

export const revalidate = 300; // ISR: refresh every 5 minutes

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  // Optional columns if you later add media to brands:
  // logo_url?: string | null;
  // banner_url?: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  hero_image_path?: string | null; // e.g. "SKU/filename.jpg"
  created_at?: string;
};

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const supabase = supabaseServer();
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl ?? null;
}

export async function generateStaticParams() {
  // Pre-render a small set of brand pages (ISR will handle the rest on-demand)
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('brands')
    .select('slug')
    .order('name', { ascending: true })
    .limit(50); // adjust if you want more static pages

  if (error || !data) return [];
  return data.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = supabaseServer();
  const { data: brand } = await supabase
    .from('brands')
    .select('*') // safe even if you add optional columns later
    .eq('slug', params.slug)
    .maybeSingle<BrandRow>();

  if (!brand) {
    return { title: 'Brand Not Found | Made Korea' };
  }

  return {
    title: `${brand.name} | Made Korea`,
    description: brand.description ?? `Explore ${brand.name} products.`,
    alternates: { canonical: `/brands/${params.slug}` },
    openGraph: {
      title: `${brand.name} | Made Korea`,
      description: brand.description ?? undefined,
      url: `/brands/${params.slug}`,
      type: 'website',
    },
  };
}

export default async function BrandPage({ params }: { params: { slug: string } }) {
  const supabase = supabaseServer();

  // 1) Brand lookup
  const { data: brand, error: brandErr } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', params.slug)
    .maybeSingle<BrandRow>();

  if (brandErr || !brand) {
    notFound();
  }

  // 2) Fetch this brand's published products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, slug, name, price, currency, hero_image_path, created_at')
    .eq('brand_id', brand.id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<ProductRow[]>();

  if (prodErr) {
    // If query fails, treat as empty but still render the brand page
    // You could also choose to bubble an error boundary.
  }

  // 3) Map hero_image_path -> public URL (without changing ProductCard shape)
  const items = (products ?? []).map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));

  return (
    <CustomerLayout>
      {/* Optional brand banner if you later add a column like brand.banner_url */}
      {/* {brand.banner_url && (
        <div className="relative w-full aspect-[21/7] bg-muted mb-8">
          <Image src={brand.banner_url} alt={brand.name} fill className="object-cover" />
        </div>
      )} */}

      <div className="container mx-auto py-6 sm:py-8">
        {/* Brand header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Optional brand logo if you add brand.logo_url later */}
          {/* {brand.logo_url && (
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
              <Image src={brand.logo_url} alt={brand.name} fill className="object-contain" />
            </div>
          )} */}
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2">
              {brand.name}
            </h1>
            {brand.description && (
              <p className="text-sm sm:text-base text-muted-foreground max-w-3xl">
                {brand.description}
              </p>
            )}
          </div>
        </div>

        {/* Count + future filters row (kept simple for now) */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <p className="text-xs sm:text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? 'product' : 'products'}
          </p>
        </div>

        {/* Products grid */}
        {items.length === 0 ? (
          <div className="text-center py-10 sm:py-12">
            <p className="text-sm sm:text-base text-muted-foreground">
              No products available from this brand yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
