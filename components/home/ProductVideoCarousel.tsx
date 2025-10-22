/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeProductVideo } from "@/types/home_product_videos";

interface ProductVideoCarouselProps {
  videos?: HomeProductVideo[]; // optional to prevent runtime crash
}

export function ProductVideoCarousel({ videos = [] }: ProductVideoCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [slidesPerView, setSlidesPerView] = useState(6); // will be read from CSS var
  const [currentPage, setCurrentPage] = useState(0);

  // keep only playable
  const items = useMemo(() => videos.filter((v) => !!v.video_url), [videos]);
  if (!Array.isArray(items) || items.length === 0) return null;

  // duplicate once for seamless loop
  const loopItems = useMemo(
    () => [...items, ...items.map((v, i) => ({ ...v, id: `${v.id}-dup-${i}` }))],
    [items]
  );

  // helper: read CSS var --slides
  const readSlidesFromCSSVar = () => {
    const el = scrollContainerRef.current;
    if (!el) return slidesPerView;
    const val = getComputedStyle(el).getPropertyValue("--slides").trim();
    const n = parseInt(val || "6", 10);
    return Number.isFinite(n) && n > 0 ? n : slidesPerView;
  };

  // width of one card + gap
  const getStep = () => {
    const el = scrollContainerRef.current;
    if (!el) return 0;
    const firstCard = el.querySelector<HTMLElement>('[data-card="true"]');
    if (!firstCard) return 0;
    const gap = parseFloat(getComputedStyle(el).gap || "0") || 0;
    return Math.round(firstCard.getBoundingClientRect().width + gap);
  };

  // align to nearest card boundary
  const alignToSnap = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const s = getStep();
    if (!s) return;
    const idx = Math.round(el.scrollLeft / s);
    el.scrollLeft = idx * s;
  };

  // total pages (based on original set)
  const totalPages = Math.max(1, Math.ceil(items.length / Math.max(1, slidesPerView)));

  // compute page from current scroll
  const computeAndSetPage = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const s = getStep();
    if (!s) return;
    const idxRaw = Math.round(el.scrollLeft / s); // card index including clones
    const idx = ((idxRaw % items.length) + items.length) % items.length; // normalize
    const spv = readSlidesFromCSSVar();
    const page = Math.floor(idx / Math.max(1, spv));
    setCurrentPage(Math.min(totalPages - 1, Math.max(0, page)));
  };

  // autoplay (advance by 1 card every 4s, then snap & handle loop)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // sync slidesPerView with CSS var initially & on resize
    const syncSpv = () => setSlidesPerView(readSlidesFromCSSVar());
    syncSpv();

    alignToSnap();
    computeAndSetPage();

    let tickTimer: number | null = null;
    let afterScrollTimer: number | null = null;

    const tick = () => {
      if (isPaused) return;
      const s = getStep();
      if (!s) return;

      const curIdx = Math.round(el.scrollLeft / s);
      const targetLeft = (curIdx + 1) * s;
      el.scrollTo({ left: targetLeft, behavior: "smooth" });

      if (afterScrollTimer) window.clearTimeout(afterScrollTimer);
      afterScrollTimer = window.setTimeout(() => {
        const half = el.scrollWidth / 2; // width of first (original) set
        if (el.scrollLeft >= half - s / 2) {
          el.scrollLeft = el.scrollLeft - half; // jump back exactly one set width
        }
        alignToSnap();
        computeAndSetPage();
      }, 450) as unknown as number;
    };

    tickTimer = window.setInterval(tick, 4000) as unknown as number;

    const onScroll = () => {
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half - 2) el.scrollLeft = el.scrollLeft - half; // seamless loop
      computeAndSetPage();
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      syncSpv();
      // re-align on breakpoints to avoid drift, and update page
      requestAnimationFrame(() => {
        alignToSnap();
        computeAndSetPage();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (tickTimer) window.clearInterval(tickTimer);
      if (afterScrollTimer) window.clearTimeout(afterScrollTimer);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [isPaused, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // click a page dot
  const goToPage = (pageIndex: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const s = getStep();
    const spv = readSlidesFromCSSVar();
    if (!s || !spv) return;

    const half = el.scrollWidth / 2;
    const pageWidth = s * spv;
    const targetInFirst = pageIndex * pageWidth; // page start in first set
    const targetInSecond = targetInFirst + half; // mirror in cloned set
    // choose the closer target to avoid big jumps
    const cur = el.scrollLeft;
    const target =
      Math.abs(cur - targetInFirst) <= Math.abs(cur - targetInSecond)
        ? targetInFirst
        : targetInSecond;

    setIsPaused(true); // pause autoplay briefly after interaction
    el.scrollTo({ left: target, behavior: "smooth" });
    window.setTimeout(() => {
      alignToSnap();
      computeAndSetPage();
      setIsPaused(false);
    }, 500);
  };

  return (
    <section className="relative">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">한국 최고 상품을 드려요! - KOREA'S BEST FOR YOU</h2>
        <p className="text-muted-foreground">
          Watch and discover the best Consumer Innovations products in action
        </p>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Exact N-per-view sizing via CSS vars */}
        <div
          ref={scrollContainerRef}
          className="
            flex overflow-x-auto scrollbar-hide
            snap-x snap-mandatory [scroll-snap-stop:always]
            [--slide-gap:1rem] gap-[var(--slide-gap)]
            [--slides:2] md:[--slides:3] lg:[--slides:4] xl:[--slides:6] 2xl:[--slides:6]
            [scrollbar-width:none] [-ms-overflow-style:none]
          "
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {loopItems.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {Array.from({ length: totalPages }).map((_, i) => {
              const active = i === currentPage;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to page ${i + 1}`}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "h-2 rounded-full transition-all",
                    active ? "w-8 bg-foreground/90" : "w-2 bg-foreground/30 hover:bg-foreground/50",
                  ].join(" ")}
                  onClick={() => goToPage(i)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function VideoCard({ video }: { video: HomeProductVideo }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          } else {
            el.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play();
      setIsPlaying(true);
    }
  };

  const currency = video.currency ?? "INR";
  const priceNum = typeof video.price === "number" ? video.price : 0;
  const price = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(priceNum);

  return (
    <div
      data-card="true"
      className="
        shrink-0 snap-start relative group cursor-pointer
        basis-[calc((100%-(var(--slide-gap)*(var(--slides)-1)))/var(--slides))]
        max-w-full
      "
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={togglePlay}
    >
      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-muted shadow-lg">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          loop
          muted={isMuted}
          playsInline
          poster={video.thumbnail_url ?? undefined}
        >
          {/* default to mp4; if you support other types add extra <source> tags */}
          <source src={video.video_url ?? ""} type="video/mp4" />
        </video>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          {/* <h3 className="font-semibold text-sm mb-1 line-clamp-2">{video.title}</h3> */}
          {video.description && (
            <p className="text-xs text-white/80 mb-2 line-clamp-1">{video.description}</p>
          )}
          <div className="flex items-center justify-between">
            {/* <span className="text-lg font-bold">{price}</span> */}
            {/* <Button
              size="sm"
              className="pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                if (video.product_slug) {
                  window.location.href = `/product/${video.product_slug}`;
                }
              }}
            >
              <ShoppingCart className="h-4 w-4 mr-1" />
              Shop
            </Button> */}
          </div>
        </div>

        {showControls && (
          <div className="absolute top-4 right-4 pointer-events-auto">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full shadow-lg backdrop-blur-sm bg-white/90 hover:bg-white h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
