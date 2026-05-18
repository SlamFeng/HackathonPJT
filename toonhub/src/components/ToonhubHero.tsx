import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

const IMAGES = [
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png',
    bg: '#F4845F',
    panel: '#F79B7F',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png',
    bg: '#6BBF7A',
    panel: '#85CC92',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png',
    bg: '#E882B4',
    panel: '#ED9DC4',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png',
    bg: '#6EB5FF',
    panel: '#8DC4FF',
  },
] as const

type Direction = 'next' | 'prev'

const EASE = '650ms cubic-bezier(0.4,0,0.2,1)'

function getRole(index: number, activeIndex: number) {
  const center = activeIndex
  const left = (activeIndex + 3) % 4
  const right = (activeIndex + 1) % 4

  if (index === center) return 'center'
  if (index === left) return 'left'
  if (index === right) return 'right'
  return 'back'
}

export default function ToonhubHero() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const unlockTimerRef = useRef<number | null>(null)

  const grainDataUri = useMemo(() => {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.08'/></svg>"
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }, [])

  useEffect(() => {
    for (const { src } of IMAGES) {
      const img = new Image()
      img.src = src
    }
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current)
      }
    }
  }, [])

  const navigate = (direction: Direction) => {
    if (isAnimating) return

    setIsAnimating(true)
    setActiveIndex((prev) => {
      if (direction === 'next') return (prev + 1) % 4
      return (prev + 3) % 4
    })

    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current)
    }
    unlockTimerRef.current = window.setTimeout(() => {
      setIsAnimating(false)
      unlockTimerRef.current = null
    }, 650)
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        backgroundColor: IMAGES[activeIndex].bg,
        transition: `background-color ${EASE}`,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div className="relative w-full overflow-hidden" style={{ height: '100vh' }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 50,
            opacity: 0.4,
            backgroundImage: grainDataUri,
            backgroundSize: '200px 200px',
            backgroundRepeat: 'repeat',
          }}
        />

        <div
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none select-none"
          style={{
            zIndex: 2,
            top: '18%',
            fontFamily: "'Anton', sans-serif",
            fontSize: 'clamp(90px, 28vw, 380px)',
            fontWeight: 900,
            color: 'white',
            opacity: 1,
            lineHeight: 1,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          3D SHAPE
        </div>

        <div
          className="absolute top-6 left-4 sm:left-8 text-xs font-semibold uppercase text-white"
          style={{ zIndex: 60, opacity: 0.9, letterSpacing: '0.18em' }}
        >
          TOONHUB
        </div>

        <div className="absolute inset-0" style={{ zIndex: 3 }}>
          {IMAGES.map((img, idx) => {
            const role = getRole(idx, activeIndex)

            const baseStyle: CSSProperties = {
              position: 'absolute',
              left: '50%',
              bottom: 0,
              aspectRatio: '0.6 / 1',
              transform: 'translateX(-50%) scale(1)',
              opacity: 1,
              filter: 'blur(0px)',
              transition: `transform ${EASE}, filter ${EASE}, opacity ${EASE}, left ${EASE}`,
              willChange: 'transform, filter, opacity',
            }

            const centerStyle: CSSProperties = {
              left: '50%',
              height: isMobile ? '60%' : '92%',
              bottom: isMobile ? '22%' : 0,
              transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.68})`,
              opacity: 1,
              filter: 'blur(0px)',
              zIndex: 20,
            }

            const leftStyle: CSSProperties = {
              left: isMobile ? '20%' : '30%',
              height: isMobile ? '16%' : '28%',
              bottom: isMobile ? '32%' : '12%',
              transform: 'translateX(-50%) scale(1)',
              opacity: 0.85,
              filter: 'blur(2px)',
              zIndex: 10,
            }

            const rightStyle: CSSProperties = {
              left: isMobile ? '80%' : '70%',
              height: isMobile ? '16%' : '28%',
              bottom: isMobile ? '32%' : '12%',
              transform: 'translateX(-50%) scale(1)',
              opacity: 0.85,
              filter: 'blur(2px)',
              zIndex: 10,
            }

            const backStyle: CSSProperties = {
              left: '50%',
              height: isMobile ? '13%' : '22%',
              bottom: isMobile ? '32%' : '12%',
              transform: 'translateX(-50%) scale(1)',
              opacity: 1,
              filter: 'blur(4px)',
              zIndex: 5,
            }

            const roleStyle =
              role === 'center'
                ? centerStyle
                : role === 'left'
                  ? leftStyle
                  : role === 'right'
                    ? rightStyle
                    : backStyle

            return (
              <div key={img.src} style={{ ...baseStyle, ...roleStyle }}>
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                  }}
                />
              </div>
            )
          })}
        </div>

        <div
          className="absolute bottom-6 left-4 sm:bottom-20 sm:left-24"
          style={{ zIndex: 60, maxWidth: 320 }}
        >
          <p
            className="mb-2 sm:mb-3 text-base sm:text-[22px] font-bold uppercase text-white"
            style={{ opacity: 0.95, letterSpacing: '0.02em' }}
          >
            TOONHUB FIGURINES
          </p>
          <p
            className="hidden sm:block mb-4 sm:mb-5 text-xs sm:text-sm text-white"
            style={{ opacity: 0.85, lineHeight: 1.6 }}
          >
            The artwork is stunning, shipped fully prepared. The finish is a vision, the 3D
            craft is flawless. Many thanks! Wishing you the win. Order now.
          </p>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => navigate('prev')}
              className="grid place-items-center w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-white text-white transition-[transform,background-color] duration-150 hover:scale-[1.08] hover:bg-white/10"
            >
              <ArrowLeft size={26} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => navigate('next')}
              className="grid place-items-center w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-white text-white transition-[transform,background-color] duration-150 hover:scale-[1.08] hover:bg-white/10"
            >
              <ArrowRight size={26} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <a
          href="#"
          className="absolute bottom-6 right-4 sm:bottom-20 sm:right-10 flex items-center gap-2 text-white no-underline opacity-95 hover:opacity-100 transition-opacity duration-200"
          style={{
            zIndex: 60,
            fontFamily: "'Anton', sans-serif",
            fontSize: 'clamp(20px, 4vw, 56px)',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          DISCOVER IT
          <ArrowRight className="w-5 h-5 sm:w-8 sm:h-8" strokeWidth={2.25} />
        </a>
      </div>
    </div>
  )
}

