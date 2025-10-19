'use client';

import { useEffect, useRef, useState } from 'react';
import type { InfluencerVideo } from '@/types/influencer_video';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Volume2, VolumeX, ExternalLink } from 'lucide-react';

export function InstagramVideoCarousel({ videos }: { videos: InfluencerVideo[] }) {
  const playable = (videos ?? []).filter((v) => !!v.video_url);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  if (!playable.length) return null;

  const check = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 0);
    setCanRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    check();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', check);
    return () => el.removeEventListener('scroll', check);
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 320;
    el.scrollTo({ left: el.scrollLeft + (dir === 'left' ? -amount : amount), behavior: 'smooth' });
  };

  return (
    <section className="relative">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Creator Videos</h2>
        <p className="text-muted-foreground">Short clips from influencers and reviewers</p>
      </div>

      <div className="relative group">
        {canLeft && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll('left')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        {canRight && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => scroll('right')}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {playable.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoCard({ video }: { video: InfluencerVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const inView = entries[0]?.isIntersecting ?? false;
        if (inView) {
          el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        } else {
          el.pause();
          setIsPlaying(false);
        }
      },
      { threshold: 0.5 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const toggleMute = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const togglePlay = () => {
    const el = ref.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  return (
    <div
      className="flex-shrink-0 w-[280px] snap-start relative group cursor-pointer"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={togglePlay}
    >
      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-muted shadow-lg">
        <video
          ref={ref}
          className="w-full h-full object-cover"
          loop
          muted={isMuted}
          playsInline
          poster={video.thumbnail_url ?? undefined}
        >
          <source src={video.video_url ?? ''} type="video/mp4" />
        </video>

        {/* overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

        {/* bottom meta */}
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          {/* <h3 className="font-semibold text-sm mb-1 line-clamp-2">{video.influencer_name}</h3> */}
          {video.caption && (
            <p className="text-xs text-white/80 mb-2 line-clamp-1">{video.caption}</p>
          )}
          <div className="flex items-center justify-between">
            {/* {typeof video.views === 'number' ? (
              <span className="text-xs text-white/70">{Intl.NumberFormat('en', { notation: 'compact' }).format(video.views)} views</span>
            ) : <span />} */}
            {video.instagram_link && (
              <Button
                size="sm"
                className="pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(video.instagram_link!, '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                View post
              </Button>
            )}
          </div>
        </div>

        {/* mute button */}
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
