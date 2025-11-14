// app/products/[slug]/page.tsx
export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import ProductPage from './product';

// Build a public URL for images in the "product-media" bucket
function publicFromProductMedia(path?: string | null) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}`;
}

const SITE =
  (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://madenkorea.com').replace(/\/$/, '');

// ----------------- Metadata -----------------
export async function generateMetadata(
  { params }: { params: { slug?: string; handle?: string } }
): Promise<Metadata> {
  const slug = params?.slug || params?.handle;
  if (!slug) {
    return {
      title: 'Product not found | MadenKorea',
      description: 'This product is unavailable.',
      robots: { index: false, follow: false },
    };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: prod } = await supabase
    .from('products')
    .select(`
      id, slug, name, short_description, description,
      price, currency, sale_price, compare_at_price, hero_image_path,
      brands ( name, slug )
    `)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (!prod) {
    return {
      title: 'Product not found | MadenKorea',
      description: 'This product is unavailable.',
      robots: { index: false, follow: false },
    };
  }

  const canonical = `${SITE}/products/${prod.slug}`;
  const image =
    publicFromProductMedia(prod.hero_image_path) ?? `${SITE}/og/product-default.jpg`;

  const title = `${prod.name} — Buy Online at MadenKorea`;
  const description =
    prod.short_description ??
    (prod.description ? prod.description.slice(0, 160) : 'Shop Korean beauty and lifestyle products.');
  const currency = (prod.currency ?? 'INR').toUpperCase();

  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      'MadenKorea',
      'Korean beauty',
      'K-beauty',
      prod.brands?.name || 'Brand',
      prod.name,
    ],
    openGraph: {
      url: canonical,
      siteName: 'MadenKorea',
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: prod.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

// ----------------- Page -----------------
export default async function Page({
  params,
}: {
  params: { slug?: string; handle?: string };
}) {
  const slug = params?.slug || params?.handle;
  if (!slug) notFound();

  // Fetch again here so we can emit JSON-LD (keeps ProductPage untouched)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: prod } = await supabase
    .from('products')
    .select(`
      id, slug, name, short_description, description,
      price, currency, sale_price, compare_at_price, hero_image_path,
      brands ( name, slug )
    `)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (!prod) notFound();

  const image =
    publicFromProductMedia(prod.hero_image_path) ?? `${SITE}/og/product-default.jpg`;
  const description =
    prod.short_description ??
    (prod.description ? prod.description.slice(0, 160) : undefined);
  const currency = (prod.currency ?? 'INR').toUpperCase();

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: prod.name,
    description,
    image: [image],
    brand: prod.brands?.name ? { '@type': 'Brand', name: prod.brands.name } : undefined,
    offers: {
      '@type': 'Offer',
      url: `${SITE}/products/${prod.slug}`,
      priceCurrency: currency,
      price: prod.sale_price ?? prod.price,
      // availability, sku, ratings, etc. can be added if your schema has them
    },
  };

  return (
    <>
      <ProductPage />
      <script
        type="application/ld+json"
        // undefined fields are omitted by JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
    </>
  );
}
