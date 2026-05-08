'use client';

// Ported from https://codepen.io/JuanFuentes/full/rgXKGQ
// Font used: https://compressa.preusstype.com/

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

interface Point { x: number; y: number }

const dist = (a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const getAttr = (distance: number, maxDist: number, minVal: number, maxVal: number) => {
  const val = maxVal - Math.abs((maxVal * distance) / maxDist);
  return Math.max(minVal, val + minVal);
};

interface TextPressureProps {
  text?:        string;
  fontFamily?:  string;
  fontUrl?:     string;
  width?:       boolean;
  weight?:      boolean;
  italic?:      boolean;
  alpha?:       boolean;
  flex?:        boolean;
  stroke?:      boolean;
  scale?:       boolean;
  textColor?:   string;
  strokeColor?: string;
  className?:   string;
  minFontSize?: number;
}

export default function TextPressure({
  text        = 'Hello!',
  fontFamily  = 'Compressa VF',
  fontUrl     = 'https://res.cloudinary.com/dr6lvwubh/raw/upload/v1529908256/CompressaPRO-GX.woff2',
  width       = true,
  weight      = true,
  italic      = true,
  alpha       = false,
  flex        = true,
  stroke      = false,
  scale       = false,
  textColor   = '#FFFFFF',
  strokeColor = '#FF0000',
  className   = '',
  minFontSize = 24,
}: TextPressureProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef     = useRef<HTMLHeadingElement>(null);
  const spansRef     = useRef<(HTMLSpanElement | null)[]>([]);
  const mouseRef     = useRef<Point>({ x: 0, y: 0 });
  const cursorRef    = useRef<Point>({ x: 0, y: 0 });

  const [fontSize,    setFontSize]    = useState(minFontSize);
  const [scaleY,      setScaleY]      = useState(1);
  const [lineHeight,  setLineHeight]  = useState(1);

  const chars = text.split('');

  // Track cursor / touch position
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
    };
    const onTouch = (e: TouchEvent) => {
      cursorRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('touchmove', onTouch, { passive: true });

    if (containerRef.current) {
      const { left, top, width: w, height: h } = containerRef.current.getBoundingClientRect();
      const center = { x: left + w / 2, y: top + h / 2 };
      mouseRef.current  = center;
      cursorRef.current = center;
    }
    return () => {
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
    };
  }, []);

  // Calculate font size from container width
  const measure = useCallback(() => {
    if (!containerRef.current || !titleRef.current) return;
    const { width: cw, height: ch } = containerRef.current.getBoundingClientRect();

    const next = Math.max(cw / (chars.length / 2), minFontSize);
    setFontSize(next);
    setScaleY(1);
    setLineHeight(1);

    if (scale) {
      requestAnimationFrame(() => {
        if (!titleRef.current) return;
        const th = titleRef.current.getBoundingClientRect().height;
        if (th > 0) {
          setScaleY(ch / th);
          setLineHeight(ch / th);
        }
      });
    }
  }, [chars.length, minFontSize, scale]);

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(id); id = setTimeout(measure, 100); };
    debounced();
    window.addEventListener('resize', debounced);
    return () => { window.removeEventListener('resize', debounced); clearTimeout(id); };
  }, [measure]);

  // RAF animation loop — variable font axes follow cursor
  useEffect(() => {
    let raf: number;
    const animate = () => {
      mouseRef.current.x += (cursorRef.current.x - mouseRef.current.x) / 15;
      mouseRef.current.y += (cursorRef.current.y - mouseRef.current.y) / 15;

      if (titleRef.current) {
        const maxDist = titleRef.current.getBoundingClientRect().width / 2;

        spansRef.current.forEach((span) => {
          if (!span) return;
          const r = span.getBoundingClientRect();
          const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          const d = dist(mouseRef.current, center);

          const wdth   = width  ? Math.floor(getAttr(d, maxDist, 5,   200)) : 100;
          const wght   = weight ? Math.floor(getAttr(d, maxDist, 100, 900)) : 400;
          const italV  = italic ? getAttr(d, maxDist, 0, 1).toFixed(2)      : '0';
          const alphaV = alpha  ? getAttr(d, maxDist, 0, 1).toFixed(2)      : '1';

          const fvs = `'wght' ${wght}, 'wdth' ${wdth}, 'ital' ${italV}`;
          if (span.style.fontVariationSettings !== fvs) span.style.fontVariationSettings = fvs;
          if (alpha) span.style.opacity = alphaV;
        });
      }
      raf = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(raf);
  }, [width, weight, italic, alpha]);

  const styleEl = useMemo(() => (
    <style>{`
      @font-face {
        font-family: '${fontFamily}';
        src: url('${fontUrl}');
        font-style: normal;
      }
      .tp-flex   { display: flex; justify-content: space-between; }
      .tp-stroke span { position: relative; }
      .tp-stroke span::after {
        content: attr(data-char);
        position: absolute;
        left: 0; top: 0;
        color: transparent;
        z-index: -1;
        -webkit-text-stroke-width: 3px;
        -webkit-text-stroke-color: ${strokeColor};
      }
    `}</style>
  ), [fontFamily, fontUrl, strokeColor]);

  const cls = [className, flex ? 'tp-flex' : '', stroke ? 'tp-stroke' : ''].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', background: 'transparent' }}>
      {styleEl}
      <h1
        ref={titleRef}
        className={cls}
        style={{
          fontFamily,
          textTransform: 'uppercase',
          fontSize,
          lineHeight,
          transform: `scale(1, ${scaleY})`,
          transformOrigin: 'center top',
          margin: 0,
          fontWeight: 100,
          width: '100%',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          color: textColor,
        }}
      >
        {chars.map((char, i) => (
          <span
            key={i}
            ref={(el) => { spansRef.current[i] = el; }}
            data-char={char}
            style={{ display: 'inline-block', color: stroke ? undefined : textColor }}
          >
            {char === ' ' ? ' ' : char}
          </span>
        ))}
      </h1>
    </div>
  );
}
