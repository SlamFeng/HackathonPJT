"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LanguageToggle, useI18n } from "@/lib/i18n";

type IdleRequestHandle = number;

function requestIdle(cb: () => void, timeoutMs = 1200): IdleRequestHandle {
  if (typeof window === "undefined") return 0;
  const anyWindow = window as unknown as { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number };
  if (anyWindow.requestIdleCallback) {
    return anyWindow.requestIdleCallback(cb, { timeout: timeoutMs });
  }
  return window.setTimeout(cb, Math.min(timeoutMs, 400));
}

function cancelIdle(handle: IdleRequestHandle) {
  if (typeof window === "undefined") return;
  const anyWindow = window as unknown as { cancelIdleCallback?: (id: number) => void };
  if (anyWindow.cancelIdleCallback) {
    anyWindow.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

async function decodeImage(src: string) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }
}

export default function Home() {
  const { t } = useI18n();
  const IMAGES = useMemo(
    () => [
      {
        src: "https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png",
        bg: "#F4845F",
      },
      {
        src: "https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png",
        bg: "#6BBF7A",
      },
      {
        src: "https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png",
        bg: "#E882B4",
      },
      {
        src: "https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png",
        bg: "#6EB5FF",
      },
    ],
    [],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const unlockTimerRef = useRef<number | null>(null);
  const idleHandleRef = useRef<IdleRequestHandle | null>(null);
  const preloadRef = useRef<Map<string, Promise<void>>>(new Map());

  const grainDataUri = useMemo(() => {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.08'/></svg>";
    return `url(\"data:image/svg+xml,${encodeURIComponent(svg)}\")`;
  }, []);

  const preload = useCallback((src: string) => {
    const cached = preloadRef.current.get(src);
    if (cached) return cached;
    const p = decodeImage(src);
    preloadRef.current.set(src, p);
    return p;
  }, []);

  const preloadNeighbors = useCallback((index: number) => {
    const next = (index + 1) % IMAGES.length;
    const prev = (index + IMAGES.length - 1) % IMAGES.length;
    preload(IMAGES[index]!.src);
    preload(IMAGES[next]!.src);
    preload(IMAGES[prev]!.src);
  }, [IMAGES, preload]);

  useEffect(() => {
    preloadNeighbors(0);
    idleHandleRef.current = requestIdle(() => {
      for (let i = 0; i < IMAGES.length; i += 1) {
        preload(IMAGES[i]!.src);
      }
    });
    return () => {
      if (idleHandleRef.current !== null) {
        cancelIdle(idleHandleRef.current);
        idleHandleRef.current = null;
      }
    };
  }, [IMAGES, preload, preloadNeighbors]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    preloadNeighbors(activeIndex);
    if (idleHandleRef.current !== null) {
      cancelIdle(idleHandleRef.current);
    }
    idleHandleRef.current = requestIdle(() => {
      for (let i = 0; i < IMAGES.length; i += 1) {
        if (i === activeIndex) continue;
        preload(IMAGES[i]!.src);
      }
    });
  }, [IMAGES, activeIndex, preload, preloadNeighbors]);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
      }
      if (idleHandleRef.current !== null) {
        cancelIdle(idleHandleRef.current);
        idleHandleRef.current = null;
      }
    };
  }, []);

  const DURATION_MS = 650;
  const EASE = `${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1)`;

  function getRole(index: number, active: number) {
    const center = active;
    const left = (active + 3) % 4;
    const right = (active + 1) % 4;
    if (index === center) return "center";
    if (index === left) return "left";
    if (index === right) return "right";
    return "back";
  }

  function navigate(direction: "next" | "prev") {
    if (isAnimating) return;
    setIsAnimating(true);
    setActiveIndex((prev) => {
      const next = direction === "next" ? (prev + 1) % IMAGES.length : (prev + IMAGES.length - 1) % IMAGES.length;
      preloadNeighbors(next);
      return next;
    });

    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
    }
    unlockTimerRef.current = window.setTimeout(() => {
      setIsAnimating(false);
      unlockTimerRef.current = null;
    }, DURATION_MS);
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        backgroundColor: IMAGES[activeIndex]!.bg,
        transition: `background-color ${EASE}`,
      }}
    >
      <div className="relative w-full overflow-hidden" style={{ height: "100vh" }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 50,
            opacity: 0.4,
            backgroundImage: grainDataUri,
            backgroundSize: "200px 200px",
            backgroundRepeat: "repeat",
          }}
        />

        <div className="absolute left-4 top-6 text-xs font-semibold uppercase tracking-[0.18em] text-white sm:left-8" style={{ zIndex: 60, opacity: 0.9 }}>
          {t.home.brand}
        </div>
        <div className="absolute right-4 top-5 sm:right-8" style={{ zIndex: 60 }}>
          <LanguageToggle variant="dark" />
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 select-none text-center text-white"
          style={{
            zIndex: 2,
            top: "18%",
            fontSize: "clamp(72px, 22vw, 300px)",
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            textTransform: "uppercase",
          }}
        >
          {t.home.hero}
        </div>

        <div className="absolute inset-0" style={{ zIndex: 3 }}>
          {IMAGES.map((img, idx) => {
            const role = getRole(idx, activeIndex);

            const baseStyle: CSSProperties = {
              position: "absolute",
              left: "50%",
              bottom: 0,
              aspectRatio: "0.6 / 1",
              transform: "translate3d(-50%, 0, 0) scale(1)",
              opacity: 1,
              filter: "blur(0px)",
              transition: `transform ${EASE}, opacity ${EASE}, left ${EASE}`,
              willChange: "transform, opacity",
              backfaceVisibility: "hidden",
            };

            const centerStyle: CSSProperties = {
              left: "50%",
              height: isMobile ? "60%" : "92%",
              bottom: isMobile ? "22%" : 0,
              transform: `translate3d(-50%, 0, 0) scale(${isMobile ? 1.25 : 1.68})`,
              opacity: 1,
              filter: "blur(0px)",
              zIndex: 20,
            };

            const leftStyle: CSSProperties = {
              left: isMobile ? "20%" : "30%",
              height: isMobile ? "16%" : "28%",
              bottom: isMobile ? "32%" : "12%",
              transform: "translate3d(-50%, 0, 0) scale(1)",
              opacity: 0.85,
              filter: "blur(2px)",
              zIndex: 10,
            };

            const rightStyle: CSSProperties = {
              left: isMobile ? "80%" : "70%",
              height: isMobile ? "16%" : "28%",
              bottom: isMobile ? "32%" : "12%",
              transform: "translate3d(-50%, 0, 0) scale(1)",
              opacity: 0.85,
              filter: "blur(2px)",
              zIndex: 10,
            };

            const backStyle: CSSProperties = {
              left: "50%",
              height: isMobile ? "13%" : "22%",
              bottom: isMobile ? "32%" : "12%",
              transform: "translate3d(-50%, 0, 0) scale(1)",
              opacity: 1,
              filter: "blur(4px)",
              zIndex: 5,
            };

            const roleStyle =
              role === "center" ? centerStyle : role === "left" ? leftStyle : role === "right" ? rightStyle : backStyle;

            return (
              <div key={img.src} style={{ ...baseStyle, ...roleStyle }}>
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  loading={idx === activeIndex ? "eager" : "lazy"}
                  decoding="async"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    objectPosition: "bottom center",
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="absolute bottom-6 left-4 sm:bottom-20 sm:left-24" style={{ zIndex: 60, maxWidth: 360 }}>
          <p className="mb-2 text-base font-bold uppercase text-white sm:mb-3 sm:text-[22px]" style={{ opacity: 0.95, letterSpacing: "0.02em" }}>
            {t.home.title}
          </p>
          <p className="mb-4 hidden text-sm text-white sm:block sm:mb-5" style={{ opacity: 0.85, lineHeight: 1.6 }}>
            {t.home.subtitle}
          </p>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              aria-label={t.home.previous}
              onClick={() => navigate("prev")}
              className="grid h-12 w-12 place-items-center rounded-full border-2 border-white text-white transition-[transform,background-color] duration-150 hover:scale-[1.08] hover:bg-white/10 sm:h-16 sm:w-16"
            >
              <ChevronRight className="h-6 w-6 rotate-180" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label={t.home.next}
              onClick={() => navigate("next")}
              className="grid h-12 w-12 place-items-center rounded-full border-2 border-white text-white transition-[transform,background-color] duration-150 hover:scale-[1.08] hover:bg-white/10 sm:h-16 sm:w-16"
            >
              <ChevronRight className="h-6 w-6" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <Link
          href="/workbench"
          className="absolute bottom-6 right-4 flex items-center gap-2 text-white no-underline opacity-95 transition-opacity duration-200 hover:opacity-100 sm:bottom-20 sm:right-10"
          style={{
            zIndex: 60,
            fontSize: "clamp(18px, 4vw, 46px)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          {t.home.discover}
          <ArrowRight className="h-5 w-5 sm:h-8 sm:w-8" strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  );
}
