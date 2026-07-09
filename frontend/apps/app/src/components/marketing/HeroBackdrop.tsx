"use client";

/**
 * Hero backdrop — a quiet, interactive paper-surface layer.
 *
 * Design intent (editorial / quiet luxury, per tokens.ts): this is NOT a
 * flashy particle wall. It's a barely-there living texture that rewards
 * attention without competing with the type:
 *   1. A soft radial glow (sage accent) that eases toward the pointer —
 *      the "paper breathing".
 *   2. Sparse drifting motes with near-neighbour hairlines (constellation),
 *      ink at very low alpha, that lean gently toward the pointer for a
 *      subtle parallax.
 *
 * Restraint & degradation, matching the product's motion philosophy:
 *   - Pauses via IntersectionObserver when the hero scrolls out of view.
 *   - Honours prefers-reduced-motion: paints one static glow, no rAF, no
 *     pointer listeners.
 *   - Density scales with viewport width (fewer motes on mobile).
 *   - DPR-aware; debounced resize.
 *
 * Canvas 2D only — no three.js, no dependencies.
 */

import { useEffect, useRef } from "react";

const ACCENT = { r: 0x4a, g: 0x5d, b: 0x3b }; // sage — colors.accent
const TERRACOTTA = { r: 0xb4, g: 0x5a, b: 0x3c }; // colors.terracotta
const INK = { r: 0x14, g: 0x14, b: 0x14 };

type Mote = { x: number; y: number; vx: number; vy: number; r: number };

export function HeroBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Logical (CSS px) size of the canvas box; motes live in this space.
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Pointer target + eased position (glow follows with inertia).
    let pointerX = 0;
    let pointerY = 0;
    let glowX = 0;
    let glowY = 0;
    let hasPointer = false;

    let motes: Mote[] = [];

    function seedMotes() {
      // ~1 mote per 22k px², capped — sparse on purpose.
      const target = Math.min(64, Math.max(14, Math.round((width * height) / 22000)));
      motes = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: 0.8 + Math.random() * 1.4,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Default glow to upper-left third (near the headline) until the
      // pointer takes over.
      if (!hasPointer) {
        pointerX = glowX = width * 0.32;
        pointerY = glowY = height * 0.4;
      }
      seedMotes();
    }

    function drawGlow(cx: number, cy: number) {
      // Two overlapping radial fills — sage core, faint terracotta halo.
      const g1 = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.5);
      g1.addColorStop(0, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0.10)`);
      g1.addColorStop(1, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0)`);
      ctx!.fillStyle = g1;
      ctx!.fillRect(0, 0, width, height);

      const hx = width - cx * 0.6;
      const hy = height - cy * 0.4;
      const g2 = ctx!.createRadialGradient(hx, hy, 0, hx, hy, Math.max(width, height) * 0.45);
      g2.addColorStop(0, `rgba(${TERRACOTTA.r},${TERRACOTTA.g},${TERRACOTTA.b},0.05)`);
      g2.addColorStop(1, `rgba(${TERRACOTTA.r},${TERRACOTTA.g},${TERRACOTTA.b},0)`);
      ctx!.fillStyle = g2;
      ctx!.fillRect(0, 0, width, height);
    }

    function drawMotes() {
      const linkDist = 130;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        // Drift + gentle lean toward the pointer (parallax).
        m.x += m.vx;
        m.y += m.vy;
        if (hasPointer) {
          const dx = pointerX - m.x;
          const dy = pointerY - m.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 240 * 240 && d2 > 1) {
            const f = 0.006 / Math.sqrt(d2);
            m.x += dx * f;
            m.y += dy * f;
          }
        }
        // Wrap around edges.
        if (m.x < -10) m.x = width + 10;
        else if (m.x > width + 10) m.x = -10;
        if (m.y < -10) m.y = height + 10;
        else if (m.y > height + 10) m.y = -10;

        ctx!.beginPath();
        ctx!.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${INK.r},${INK.g},${INK.b},0.14)`;
        ctx!.fill();

        // Near-neighbour hairlines.
        for (let j = i + 1; j < motes.length; j++) {
          const n = motes[j];
          const dx = m.x - n.x;
          const dy = m.y - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDist) {
            const a = 0.08 * (1 - dist / linkDist);
            ctx!.strokeStyle = `rgba(${INK.r},${INK.g},${INK.b},${a.toFixed(3)})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(m.x, m.y);
            ctx!.lineTo(n.x, n.y);
            ctx!.stroke();
          }
        }
      }
    }

    let raf = 0;
    function frame() {
      ctx!.clearRect(0, 0, width, height);
      // Ease the glow toward the pointer.
      glowX += (pointerX - glowX) * 0.05;
      glowY += (pointerY - glowY) * 0.05;
      drawGlow(glowX, glowY);
      drawMotes();
      raf = requestAnimationFrame(frame);
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
      hasPointer = true;
    }

    let resizeTimer = 0;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 150);
    }

    resize();

    if (reduce) {
      // Static single paint — no animation, no pointer tracking.
      drawGlow(glowX, glowY);
      drawMotes();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    // Only animate while the hero is on screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!raf) raf = requestAnimationFrame(frame);
        } else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    />
  );
}
