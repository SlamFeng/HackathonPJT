import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface ImageItem {
  src: string
  bg: string
  panel: string
}

const IMAGES: ImageItem[] = [
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
]

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeBlend in='SourceGraphic' mode='multiply'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E\")"

const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'
const ITEM_TRANSITION = `transform 650ms ${EASING}, filter 650ms ${EASING}, opacity 650ms ${EASING}, left 650ms ${EASING}, height 650ms ${EASING}, bottom 650ms ${EASING}`

export default function ToonHubHero() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)

  useEffect(() => {
    IMAGES.forEach((item) => {
      const img = new Image()
      img.src = item.src
    })
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const navigate = useCallback(
    (dir: 'next' | 'prev') => {
      if (isAnimating) return
      setIsAnimating(true)
      setActiveIndex((prev) => (dir === 'next' ? (prev + 1) % 4 : (prev + 3) % 4))
      setTimeout(() => setIsAnimating(false), 650)
    },
    [isAnimating],
  )

  const center = activeIndex
  const left = (activeIndex + 3) % 4
  const right = (activeIndex + 1) % 4

  const getItemStyle = (index: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      aspectRatio: '0.6 / 1',
      transition: ITEM_TRANSITION,
      willChange: 'transform, filter, opacity',
      transformOrigin: 'bottom center',
    }

    if (index === center) {
      return {
        ...base,
        left: '50%',
        transform: `translateX(-50%) scale(${isMobile ? 1.0 : 1.1})`,
        filter: 'none',
        opacity: 1,
        zIndex: 20,
        height: isMobile ? '55%' : '78%',
        bottom: isMobile ? '18%' : 0,
      }
    }
    if (index === left) {
      return {
        ...base,
        left: isMobile ? '20%' : '30%',
        transform: 'translateX(-50%) scale(1)',
        filter: 'blur(2px)',
        opacity: 0.85,
        zIndex: 10,
        height: isMobile ? '16%' : '28%',
        bottom: isMobile ? '32%' : '12%',
      }
    }
    if (index === right) {
      return {
        ...base,
        left: isMobile ? '80%' : '70%',
        transform: 'translateX(-50%) scale(1)',
        filter: 'blur(2px)',
        opacity: 0.85,
        zIndex: 10,
        height: isMobile ? '16%' : '28%',
        bottom: isMobile ? '32%' : '12%',
      }
    }
    // back
    return {
      ...base,
      left: '50%',
      transform: 'translateX(-50%) scale(1)',
      filter: 'blur(4px)',
      opacity: 1,
      zIndex: 5,
      height: isMobile ? '13%' : '22%',
      bottom: isMobile ? '32%' : '12%',
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: IMAGES[activeIndex].bg,
        transition: `background-color 650ms ${EASING}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Grain overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            pointerEvents: 'none',
            backgroundImage: GRAIN_SVG,
            backgroundSize: '200px 200px',
            backgroundRepeat: 'repeat',
            opacity: 0.4,
          }}
        />

        {/* Ghost text */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '18%',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              fontFamily: "'Anton', sans-serif",
              fontSize: 'clamp(90px, 28vw, 380px)',
              fontWeight: 900,
              color: 'white',
              opacity: 1,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            3D SHAPE
          </span>
        </div>

        {/* Brand label */}
        <div
          style={{
            position: 'absolute',
            top: '1.5rem',
            left: isMobile ? '1rem' : '2rem',
            zIndex: 60,
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'white',
              opacity: 0.9,
              letterSpacing: '0.18em',
            }}
          >
            TOONHUB
          </span>
        </div>

        {/* Carousel */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
          {IMAGES.map((img, index) => (
            <div key={img.src} style={getItemStyle(index)}>
              <img
                src={img.src}
                alt={`Figurine ${index + 1}`}
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'bottom center',
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>

        {/* Bottom-left controls */}
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? '1.5rem' : '5rem',
            left: isMobile ? '1rem' : '6rem',
            zIndex: 60,
            maxWidth: '320px',
          }}
        >
          <p
            style={{
              fontWeight: 700,
              textTransform: 'uppercase',
              fontSize: isMobile ? '1rem' : '22px',
              letterSpacing: '0.02em',
              color: 'white',
              opacity: 0.95,
              margin: 0,
              marginBottom: isMobile ? '0.5rem' : '0.75rem',
            }}
          >
            TOONHUB FIGURINES
          </p>

          {!isMobile && (
            <p
              style={{
                fontSize: '0.875rem',
                color: 'white',
                opacity: 0.85,
                lineHeight: 1.6,
                margin: 0,
                marginBottom: '1.25rem',
              }}
            >
              The artwork is stunning, shipped fully prepared. The finish is a vision, the 3D craft is flawless. Many thanks! Wishing you the win. Order now.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('prev')}
              aria-label="Previous"
              style={{
                width: isMobile ? '3rem' : '4rem',
                height: isMobile ? '3rem' : '4rem',
                borderRadius: '50%',
                background: 'transparent',
                border: '2px solid white',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 150ms, background-color 150ms',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <ArrowLeft size={26} strokeWidth={2.25} />
            </button>

            <button
              onClick={() => navigate('next')}
              aria-label="Next"
              style={{
                width: isMobile ? '3rem' : '4rem',
                height: isMobile ? '3rem' : '4rem',
                borderRadius: '50%',
                background: 'transparent',
                border: '2px solid white',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 150ms, background-color 150ms',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <ArrowRight size={26} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* Bottom-right "DISCOVER IT" */}
        <a
          href="#"
          style={{
            position: 'absolute',
            bottom: isMobile ? '1.5rem' : '5rem',
            right: isMobile ? '1rem' : '2.5rem',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontFamily: "'Anton', sans-serif",
            fontSize: 'clamp(20px, 4vw, 56px)',
            fontWeight: 400,
            color: 'white',
            opacity: 0.95,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            textTransform: 'uppercase',
            textDecoration: 'none',
            transition: 'opacity 200ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.95'
          }}
        >
          DISCOVER IT
          <ArrowRight
            style={{ width: isMobile ? '1.25rem' : '2rem', height: isMobile ? '1.25rem' : '2rem' }}
            strokeWidth={2.25}
          />
        </a>
      </div>
    </div>
  )
}
