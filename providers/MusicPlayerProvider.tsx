'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

interface MusicPlayerContextType {
  musicVolume: number
  setMusicVolume: (volume: number) => void
  isMusicMuted: boolean
  setIsMusicMuted: (muted: boolean) => void
  musicPlaying: boolean
  musicReady: boolean
  currentSongIndex: number
  playlist: string[]
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined)

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext)
  if (!context) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  }
  return context
}

interface MusicPlayerProviderProps {
  children: ReactNode
}

export function MusicPlayerProvider({ children }: MusicPlayerProviderProps) {
  const pathname = usePathname()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoplayAttemptedRef = useRef(false)
  const lastLoadedSongRef = useRef<string | null>(null)
  const shouldContinuePlaylistRef = useRef(false)

  const [musicVolume, setMusicVolume] = useState(15)
  const [isMusicMuted, setIsMusicMuted] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [musicReady, setMusicReady] = useState(false)
  const [currentSongIndex, setCurrentSongIndex] = useState(0)

  // Check if we're on an admin page
  const isAdminPage = pathname?.startsWith('/admin') || pathname?.startsWith('/sadmin')

  // Playlist of 4 songs to cycle through
  const playlist = useMemo(() => [
    '/music/abysssummon2.mp3',
    '/music/summon2.mp3',
    '/music/summon.mp3',
    '/music/The Damned 3.mp3',
  ], [])

  // Set up audio element once on mount
  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio

    const handlePlay = () => {
      setMusicPlaying(true)
      shouldContinuePlaylistRef.current = true
    }

    const handlePause = () => {
      setMusicPlaying(false)
      // Only stop playlist continuation if user manually paused
      // (not if it paused due to song ending)
      if (audioRef.current && audioRef.current.ended === false) {
        shouldContinuePlaylistRef.current = false
      }
    }

    const handleCanPlay = () => {
      setMusicReady(true)
      if (!autoplayAttemptedRef.current) {
        autoplayAttemptedRef.current = true
        // Try to play, but don't worry if blocked (user can start via controls)
        audio.play().catch(() => {
          // Autoplay blocked; this is normal - user interaction will allow playback
        })
      }
    }

    const handleUserInteraction = () => {
      // Once user has interacted, try to play if audio is ready
      const currentAudio = audioRef.current
      if (currentAudio && currentAudio.readyState >= 2 && currentAudio.paused) {
        // Only play if volume is greater than 0 (not muted)
        if (currentAudio.volume > 0) {
          currentAudio.play().catch(() => {})
        }
      }
    }

    // Listen for any user interaction to enable playback
    document.addEventListener('click', handleUserInteraction, { once: true })
    document.addEventListener('touchstart', handleUserInteraction, { once: true })

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('canplay', handleCanPlay, { once: true })

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
      audio.pause()
    }
  }, [])

  // Handle playlist song changes and initial load
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const newSrc = playlist[currentSongIndex]

    // Only change src if it's actually different from what we last loaded
    if (lastLoadedSongRef.current !== newSrc) {
      lastLoadedSongRef.current = newSrc
      audio.src = newSrc
      audio.load()

      // Auto-play if we should continue the playlist (user started it and it hasn't been manually paused)
      if (shouldContinuePlaylistRef.current && !isMusicMuted && audio.volume > 0) {
        const playOnLoad = () => {
          const currentAudio = audioRef.current
          if (currentAudio && currentAudio.paused && shouldContinuePlaylistRef.current) {
            currentAudio.play().catch(() => {})
          }
        }
        audio.addEventListener('loadeddata', playOnLoad, { once: true })
        audio.addEventListener('canplay', playOnLoad, { once: true })
      }
    }
  }, [currentSongIndex, playlist, isMusicMuted])

  // Set up ended handler to move to next song
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => {
      // When song ends, move to next song in playlist
      shouldContinuePlaylistRef.current = true
      const nextIndex = (currentSongIndex + 1) % playlist.length
      setCurrentSongIndex(nextIndex)
    }

    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('ended', handleEnded)
    }
  }, [currentSongIndex, playlist])

  // Handle volume changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = isMusicMuted ? 0 : musicVolume / 100

    // If unmuted and audio is paused, try to play (user may have interacted)
    if (!isMusicMuted && audio.paused && musicReady) {
      audio.play().catch(() => {
        // Autoplay may still be blocked, that's okay
      })
    }
  }, [musicVolume, isMusicMuted, musicReady])

  // Pause music on admin pages
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isAdminPage) {
      // Pause music when entering admin pages
      if (!audio.paused) {
        audio.pause()
        shouldContinuePlaylistRef.current = false
      }
    } else {
      // Resume music when leaving admin pages (if it was playing before)
      if (audio.paused && shouldContinuePlaylistRef.current && !isMusicMuted && musicReady) {
        audio.play().catch(() => {
          // Autoplay may be blocked, that's okay
        })
      }
    }
  }, [isAdminPage, isMusicMuted, musicReady])

  const value = {
    musicVolume,
    setMusicVolume,
    isMusicMuted,
    setIsMusicMuted,
    musicPlaying,
    musicReady,
    currentSongIndex,
    playlist,
  }

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  )
}

