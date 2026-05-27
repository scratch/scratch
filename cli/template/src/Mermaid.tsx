import React, { useEffect, useId, useRef, useState } from 'react';

type MermaidProps = {
  chart?: string;
  children?: React.ReactNode;
  title?: string;
  config?: Record<string, unknown>;
};

type ViewState = {
  scale: number;
  x: number;
  y: number;
};

const DEFAULT_VIEW: ViewState = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const LIGHT_THEME = {
  background: '#ffffff',
  primaryColor: '#f8fafc',
  primaryTextColor: '#0f172a',
  primaryBorderColor: '#94a3b8',
  lineColor: '#475569',
  secondaryColor: '#eef6ff',
  tertiaryColor: '#f8fafc',
  clusterBkg: '#f8fafc',
  clusterBorder: '#cbd5e1',
  edgeLabelBackground: '#ffffff',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

type PinchState = {
  distance: number;
  centerX: number;
  centerY: number;
  view: ViewState;
};
const DARK_THEME = {
  background: '#020617',
  primaryColor: '#0f172a',
  primaryTextColor: '#e2e8f0',
  primaryBorderColor: '#38bdf8',
  lineColor: '#94a3b8',
  secondaryColor: '#111827',
  tertiaryColor: '#1e293b',
  clusterBkg: '#0f172a',
  clusterBorder: '#475569',
  edgeLabelBackground: '#0f172a',
  mainBkg: '#0f172a',
  secondBkg: '#111827',
  tertiaryBkg: '#1e293b',
  nodeBorder: '#38bdf8',
  noteBkgColor: '#111827',
  noteTextColor: '#e2e8f0',
  noteBorderColor: '#475569',
  actorBkg: '#0f172a',
  actorBorder: '#38bdf8',
  actorTextColor: '#e2e8f0',
  labelBoxBkgColor: '#0f172a',
  labelBoxBorderColor: '#475569',
  labelTextColor: '#e2e8f0',
  loopTextColor: '#e2e8f0',
  activationBkgColor: '#1e293b',
  activationBorderColor: '#38bdf8',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

function getEffectiveTheme() {
  if (typeof window === 'undefined') return 'light';
  const selectedTheme = document.documentElement.dataset.theme;
  if (selectedTheme === 'dark' || selectedTheme === 'light') return selectedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readChart(chart: string | undefined, children: React.ReactNode): string {
  if (chart) return chart.trim();
  if (typeof children === 'string') return children.trim();
  if (Array.isArray(children)) {
    return children
      .map((child) => (typeof child === 'string' ? child : ''))
      .join('')
      .trim();
  }
  return '';
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerCenter(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export default function Mermaid({ chart, children, title = 'Diagram', config }: MermaidProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const source = readChart(chart, children);
  const cardRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<PinchState | null>(null);
  const viewRef = useRef<ViewState>(DEFAULT_VIEW);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState(getEffectiveTheme);
  const [zoomPercent, setZoomPercent] = useState(100);

  const applyView = (next: ViewState) => {
    viewRef.current = next;
    setZoomPercent(Math.round(next.scale * 100));
    if (viewportRef.current) {
      viewportRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
  };

  const fitToStage = () => {
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const svgElement = viewport?.querySelector('svg');
    if (!stage || !svgElement) return;

    const stageRect = stage.getBoundingClientRect();
    const box = svgElement.viewBox?.baseVal;
    const svgWidth = box?.width || svgElement.getBoundingClientRect().width || 1;
    const svgHeight = box?.height || svgElement.getBoundingClientRect().height || 1;
    const scale = Math.min(
      1,
      Math.max(0.75, Math.min((stageRect.width - 48) / svgWidth, (stageRect.height - 48) / svgHeight)),
    );

    applyView({
      scale,
      x: Math.max(24, (stageRect.width - svgWidth * scale) / 2),
      y: Math.max(24, (stageRect.height - svgHeight * scale) / 2),
    });
  };

  const setActualSize = () => {
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const svgElement = viewport?.querySelector('svg');
    if (!stage || !svgElement) return;

    const stageRect = stage.getBoundingClientRect();
    const box = svgElement.viewBox?.baseVal;
    const svgWidth = box?.width || svgElement.getBoundingClientRect().width || 1;
    const svgHeight = box?.height || svgElement.getBoundingClientRect().height || 1;

    applyView({
      scale: 1,
      x: Math.max(24, (stageRect.width - svgWidth) / 2),
      y: Math.max(24, (stageRect.height - svgHeight) / 2),
    });
  };

  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const pointX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const pointY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const current = viewRef.current;
    const nextScale = clampScale(current.scale * factor);
    const contentX = (pointX - current.x) / current.scale;
    const contentY = (pointY - current.y) / current.scale;

    applyView({
      scale: nextScale,
      x: pointX - contentX * nextScale,
      y: pointY - contentY * nextScale,
    });
  };

  const startPinchIfReady = (stage: HTMLDivElement) => {
    const points = Array.from(activePointersRef.current.values());
    if (points.length < 2) return;

    const rect = stage.getBoundingClientRect();
    const center = pointerCenter(points[0], points[1]);
    pinchRef.current = {
      distance: pointerDistance(points[0], points[1]),
      centerX: center.x - rect.left,
      centerY: center.y - rect.top,
      view: viewRef.current,
    };
    draggingRef.current = false;
    stage.classList.remove('is-dragging');
  };

  const updatePinch = (stage: HTMLDivElement) => {
    const pinch = pinchRef.current;
    const points = Array.from(activePointersRef.current.values());
    if (!pinch || points.length < 2 || pinch.distance === 0) return;

    const nextDistance = pointerDistance(points[0], points[1]);
    const nextScale = clampScale(pinch.view.scale * (nextDistance / pinch.distance));
    const contentX = (pinch.centerX - pinch.view.x) / pinch.view.scale;
    const contentY = (pinch.centerY - pinch.view.y) / pinch.view.scale;

    applyView({
      scale: nextScale,
      x: pinch.centerX - contentX * nextScale,
      y: pinch.centerY - contentY * nextScale,
    });
  };

  useEffect(() => {
    const updateTheme = () => setTheme(getEffectiveTheme());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const observer = new MutationObserver(updateTheme);

    updateTheme();
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('scratch-theme-change', updateTheme);
    media.addEventListener('change', updateTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener('scratch-theme-change', updateTheme);
      media.removeEventListener('change', updateTheme);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
    };

    stage.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      stage.removeEventListener('wheel', onWheel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!source) return;

      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
          ...config,
        });

        const result = await mermaid.render(`mermaid-${reactId}`, source);
        if (cancelled) return;

        setError('');
        setSvg(result.svg);

        window.requestAnimationFrame(() => {
          if (viewportRef.current) {
            result.bindFunctions?.(viewportRef.current);
          }
          fitToStage();
        });
      } catch (renderError) {
        if (cancelled) return;
        setSvg('');
        setError(renderError instanceof Error ? renderError.message : 'Unable to render Mermaid diagram.');
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [source, config, reactId, theme]);

  useEffect(() => {
    const onResize = () => fitToStage();
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === cardRef.current);
      window.requestAnimationFrame(fitToStage);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && cardRef.current?.classList.contains('is-pseudo-fullscreen')) {
        cardRef.current.classList.remove('is-pseudo-fullscreen');
        document.body.classList.remove('diagram-modal-open');
        setIsFullscreen(false);
        window.requestAnimationFrame(fitToStage);
      }
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('diagram-modal-open');
    };
  }, []);

  const toggleFullscreen = async () => {
    const card = cardRef.current;
    if (!card) return;

    if (document.fullscreenElement === card) {
      await document.exitFullscreen();
      setIsFullscreen(false);
      return;
    }

    if (card.classList.contains('is-pseudo-fullscreen')) {
      card.classList.remove('is-pseudo-fullscreen');
      document.body.classList.remove('diagram-modal-open');
      setIsFullscreen(false);
      window.requestAnimationFrame(fitToStage);
      return;
    }

    try {
      await card.requestFullscreen();
      setIsFullscreen(true);
      window.requestAnimationFrame(fitToStage);
    } catch {
      card.classList.add('is-pseudo-fullscreen');
      document.body.classList.add('diagram-modal-open');
      setIsFullscreen(true);
      window.requestAnimationFrame(fitToStage);
    }
  };

  return (
    <section ref={cardRef} className="not-prose diagram-card" aria-label={title}>
      <div className="diagram-toolbar">
        <div className="diagram-label">{title}</div>
        <div className="diagram-actions">
          <span className="diagram-zoom-label" aria-live="polite">
            {zoomPercent}%
          </span>
          <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
            -
          </button>
          <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={setActualSize}>
            1:1
          </button>
          <button type="button" onClick={fitToStage}>
            Fit
          </button>
          <button type="button" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? 'Exit' : 'Full'}
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className="diagram-stage"
        onPointerDown={(event) => {
          activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (activePointersRef.current.size >= 2) {
            startPinchIfReady(event.currentTarget);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }

          if (event.button !== 0) return;
          draggingRef.current = true;
          lastPointRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.classList.add('is-dragging');
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (activePointersRef.current.has(event.pointerId)) {
            activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          }

          if (pinchRef.current) {
            updatePinch(event.currentTarget);
            return;
          }

          if (!draggingRef.current) return;
          const current = viewRef.current;
          const last = lastPointRef.current;
          lastPointRef.current = { x: event.clientX, y: event.clientY };
          applyView({
            ...current,
            x: current.x + event.clientX - last.x,
            y: current.y + event.clientY - last.y,
          });
        }}
        onPointerUp={(event) => {
          activePointersRef.current.delete(event.pointerId);
          if (pinchRef.current && activePointersRef.current.size < 2) {
            pinchRef.current = null;
            const remaining = Array.from(activePointersRef.current.values())[0];
            if (remaining) {
              lastPointRef.current = remaining;
            }
          }
          draggingRef.current = false;
          event.currentTarget.classList.remove('is-dragging');
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event) => {
          activePointersRef.current.delete(event.pointerId);
          pinchRef.current = null;
          draggingRef.current = false;
          event.currentTarget.classList.remove('is-dragging');
        }}
      >
        {svg ? (
          <div
            ref={viewportRef}
            className="diagram-viewport"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div ref={viewportRef} className="diagram-viewport">
            {!error ? <div className="diagram-status">Rendering diagram...</div> : null}
          </div>
        )}
        {error ? <div className="diagram-error">{error}</div> : null}
      </div>
    </section>
  );
}
