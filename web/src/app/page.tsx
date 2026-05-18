"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

export default function Home() {
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
  const [isMobile, setIsMobile] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < 640));
  const unlockTimerRef = useRef<number | null>(null);

  const grainDataUri = useMemo(() => {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.08'/></svg>";
    return `url(\"data:image/svg+xml,${encodeURIComponent(svg)}\")`;
  }, []);

  useEffect(() => {
    for (const { src } of IMAGES) {
      const img = new Image();
      img.src = src;
    }
  }, [IMAGES]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  const EASE = "650ms cubic-bezier(0.4,0,0.2,1)";

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
      if (direction === "next") return (prev + 1) % 4;
      return (prev + 3) % 4;
    });

    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
    }
    unlockTimerRef.current = window.setTimeout(() => {
      setIsAnimating(false);
      unlockTimerRef.current = null;
    }, 650);
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
          AI DRESSROOM
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
          TRY ON
        </div>

        <div className="absolute inset-0" style={{ zIndex: 3 }}>
          {IMAGES.map((img, idx) => {
            const role = getRole(idx, activeIndex);

            const baseStyle: CSSProperties = {
              position: "absolute",
              left: "50%",
              bottom: 0,
              aspectRatio: "0.6 / 1",
              transform: "translateX(-50%) scale(1)",
              opacity: 1,
              filter: "blur(0px)",
              transition: `transform ${EASE}, filter ${EASE}, opacity ${EASE}, left ${EASE}`,
              willChange: "transform, filter, opacity",
            };

            const centerStyle: CSSProperties = {
              left: "50%",
              height: isMobile ? "60%" : "92%",
              bottom: isMobile ? "22%" : 0,
              transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.68})`,
              opacity: 1,
              filter: "blur(0px)",
              zIndex: 20,
            };

            const leftStyle: CSSProperties = {
              left: isMobile ? "20%" : "30%",
              height: isMobile ? "16%" : "28%",
              bottom: isMobile ? "32%" : "12%",
              transform: "translateX(-50%) scale(1)",
              opacity: 0.85,
              filter: "blur(2px)",
              zIndex: 10,
            };

            const rightStyle: CSSProperties = {
              left: isMobile ? "80%" : "70%",
              height: isMobile ? "16%" : "28%",
              bottom: isMobile ? "32%" : "12%",
              transform: "translateX(-50%) scale(1)",
              opacity: 0.85,
              filter: "blur(2px)",
              zIndex: 10,
            };

            const backStyle: CSSProperties = {
              left: "50%",
              height: isMobile ? "13%" : "22%",
              bottom: isMobile ? "32%" : "12%",
              transform: "translateX(-50%) scale(1)",
              opacity: 1,
              filter: "blur(4px)",
              zIndex: 5,
            };

            const roleStyle =
              role === "center" ? centerStyle : role === "left" ? leftStyle : role === "right" ? rightStyle : backStyle;

            return (
              <div key={img.src} style={{ ...baseStyle, ...roleStyle }}>
                <img src={img.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom center" }} />
              </div>
            );
          })}
        </div>

        <div className="absolute bottom-6 left-4 sm:bottom-20 sm:left-24" style={{ zIndex: 60, maxWidth: 360 }}>
          <p className="mb-2 text-base font-bold uppercase text-white sm:mb-3 sm:text-[22px]" style={{ opacity: 0.95, letterSpacing: "0.02em" }}>
            AI 智能试衣间
          </p>
          <p className="mb-4 hidden text-sm text-white sm:block sm:mb-5" style={{ opacity: 0.85, lineHeight: 1.6 }}>
            数字人定制 · 姿态控制 · 虚拟换装 · 穿搭顾问。点击右下角进入工作台开始体验。
          </p>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => navigate("prev")}
              className="grid h-12 w-12 place-items-center rounded-full border-2 border-white text-white transition-[transform,background-color] duration-150 hover:scale-[1.08] hover:bg-white/10 sm:h-16 sm:w-16"
            >
              <ChevronRight className="h-6 w-6 rotate-180" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Next"
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
          DISCOVER IT
          <ArrowRight className="h-5 w-5 sm:h-8 sm:w-8" strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  );
}
