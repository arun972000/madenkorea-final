"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeProductVideo } from "@/types/home_product_videos";

interface ProductVideoCarouselProps {
  videos?: HomeProductVideo[]; // optional to prevent runtime crash
}

export function ProductVideoCarousel({
  videos = [],
}: ProductVideoCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll);
    return () => el.removeEventListener("scroll", checkScroll);
  }, []);

  const scroll = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = 320;
    const newScrollLeft =
      el.scrollLeft + (direction === "left" ? -scrollAmount : scrollAmount);
    el.scrollTo({ left: newScrollLeft, behavior: "smooth" });
  };

  // nothing to render
  if (!Array.isArray(videos) || videos.length === 0) return null;

  return (
    <section className="relative">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">
          Authentic Korean Skincare Products
        </h2>
        <p className="text-muted-foreground">
          Watch and discover the best Consumer Innovations products in action
        </p>
      </div>

      <div className="relative group">
        {canScrollLeft && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        {canScrollRight && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}

        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {videos
            .filter((v) => !!v.video_url) // ensure playable
            .map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
        </div>
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
      className="flex-shrink-0 w-[280px] snap-start relative group cursor-pointer"
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
            <p className="text-xs text-white/80 mb-2 line-clamp-1">
              {video.description}
            </p>
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
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
