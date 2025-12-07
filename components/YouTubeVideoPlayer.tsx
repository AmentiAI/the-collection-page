'use client'

import { useEffect, useRef, useState } from 'react'
import { useMusicPlayer } from '@/providers/MusicPlayerProvider'

interface YouTubeVideoPlayerProps {
  videoId: string
  onPlayingChange?: (isPlaying: boolean) => void
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

export default function YouTubeVideoPlayer({ videoId, onPlayingChange }: YouTubeVideoPlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null)
  const playerInstanceRef = useRef<any>(null)
  const mountedRef = useRef(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const { setIsMusicMuted } = useMusicPlayer()

  useEffect(() => {
    mountedRef.current = true

    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

      const previousCallback = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        if (previousCallback) previousCallback()
        if (mountedRef.current) {
          initializePlayer()
        }
      }
    } else {
      // API already loaded, initialize immediately
      setTimeout(() => {
        if (mountedRef.current) {
          initializePlayer()
        }
      }, 0)
    }

    function initializePlayer() {
      if (!playerRef.current || playerInstanceRef.current || !window.YT) return

      try {
        playerInstanceRef.current = new window.YT.Player(playerRef.current, {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0, // Hide YouTube controls
            disablekb: 1,
            fs: 0, // Disable fullscreen button
            iv_load_policy: 3, // Hide annotations
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            showinfo: 0,
            cc_load_policy: 0, // Hide captions
            widget_referrer: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (mountedRef.current) {
                setIsReady(true)
              }
            },
            onStateChange: (event: any) => {
              if (!mountedRef.current) return
              // YT.PlayerState.PLAYING = 1
              // YT.PlayerState.PAUSED = 2
              // YT.PlayerState.ENDED = 0
              if (event.data === 1) {
                setIsPlaying(true)
                setIsMusicMuted(true) // Mute header music when video plays
                onPlayingChange?.(true)
              } else if (event.data === 2 || event.data === 0) {
                setIsPlaying(false)
                setIsMusicMuted(false) // Unmute header music when video pauses/ends
                onPlayingChange?.(false)
              }
            },
          },
        })
      } catch (error) {
        console.error('Error initializing YouTube player:', error)
      }
    }

    return () => {
      mountedRef.current = false
      if (playerInstanceRef.current) {
        try {
          playerInstanceRef.current.destroy()
          playerInstanceRef.current = null
        } catch (e) {
          console.error('Error destroying player:', e)
        }
      }
    }
  }, [videoId, setIsMusicMuted, onPlayingChange])

  const handlePlayClick = () => {
    if (playerInstanceRef.current && isReady) {
      if (isPlaying) {
        playerInstanceRef.current.pauseVideo()
      } else {
        playerInstanceRef.current.playVideo()
      }
    }
  }

  // Inject CSS to hide YouTube UI elements and fix white line issue
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      /* Hide YouTube logo and branding */
      iframe[src*="youtube.com"] {
        position: relative;
        border: none !important;
        outline: none !important;
        display: block;
        margin: 0;
        padding: 0;
      }
      /* Hide YouTube UI overlays - these appear outside iframe in some cases */
      .ytp-watermark,
      .ytp-show-cards-title,
      .ytp-cards-teaser,
      .ytp-ce-element {
        display: none !important;
      }
      /* Fix white line on mobile */
      div[class*="YouTubeVideoPlayer"] iframe {
        border: none !important;
        outline: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  return (
    <div className="w-full relative bg-black group overflow-hidden">
      <div className="relative w-full max-w-7xl mx-auto h-[600px] md:h-[700px] lg:h-[800px] overflow-hidden bg-black">
        <div
          ref={playerRef}
          className="absolute top-0 left-0 w-full h-full z-0"
          style={{
            transform: 'scale(1.2)',
            transformOrigin: 'center center',
          }}
        />
        {/* Custom Play Button Overlay */}
        {!isPlaying && (
          <button
            onClick={handlePlayClick}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors z-10 cursor-pointer"
            aria-label="Play video"
            type="button"
          >
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-[#ff0000]/90 hover:bg-[#ff0000] flex items-center justify-center transition-all transform hover:scale-110 shadow-[0_0_30px_rgba(255,0,0,0.5)]">
              <svg
                className="w-10 h-10 md:w-12 md:h-12 text-white ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
        {/* Pause Button Overlay (when playing) */}
        {isPlaying && (
          <button
            onClick={handlePlayClick}
            className="absolute inset-0 flex items-center justify-center bg-transparent hover:bg-black/10 transition-colors z-10 cursor-pointer opacity-0 hover:opacity-100"
            aria-label="Pause video"
            type="button"
          >
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-all transform hover:scale-110">
              <svg
                className="w-8 h-8 md:w-10 md:h-10 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

