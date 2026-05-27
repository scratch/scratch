import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { AnimationItem } from 'lottie-web';

type LottiePlayerProps = {
  animationData: unknown;
  title?: string;
  caption?: React.ReactNode;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
};

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function LottiePlayer({
  animationData,
  title = 'Lottie animation',
  caption,
  loop = true,
  autoplay = true,
  className,
}: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function mountAnimation() {
      if (!containerRef.current) return;

      try {
        const { default: lottie } = await import('lottie-web');
        if (disposed || !containerRef.current) return;

        const reduceMotion = prefersReducedMotion();
        const animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop,
          autoplay: autoplay && !reduceMotion,
          animationData,
          rendererSettings: {
            progressiveLoad: true,
            preserveAspectRatio: 'xMidYMid meet',
          },
        });

        animationRef.current = animation;
        setIsPlaying(autoplay && !reduceMotion);

        if (reduceMotion) {
          animation.goToAndStop(42, true);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load Lottie animation.');
      }
    }

    mountAnimation();

    return () => {
      disposed = true;
      animationRef.current?.destroy();
      animationRef.current = null;
    };
  }, [animationData, autoplay, loop]);

  function play() {
    animationRef.current?.play();
    setIsPlaying(true);
  }

  function pause() {
    animationRef.current?.pause();
    setIsPlaying(false);
  }

  function replay() {
    animationRef.current?.goToAndPlay(0, true);
    setIsPlaying(true);
  }

  return (
    <figure className={`not-prose scratch-lottie ${className || ''}`.trim()}>
      <div className="scratch-lottie-toolbar">
        <figcaption>{title}</figcaption>
        <div className="scratch-lottie-actions" aria-label="Animation controls">
          <button type="button" onClick={replay} aria-label="Replay animation">
            <RotateCcw aria-hidden="true" />
          </button>
          {isPlaying ? (
            <button type="button" onClick={pause} aria-label="Pause animation">
              <Pause aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={play} aria-label="Play animation">
              <Play aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="scratch-lottie-stage">
        {error ? <p className="scratch-lottie-error">{error}</p> : <div ref={containerRef} />}
      </div>
      {caption ? <p className="scratch-lottie-caption">{caption}</p> : null}
    </figure>
  );
}

export default LottiePlayer;
