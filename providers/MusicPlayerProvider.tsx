'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

interface MusicPlayerContextType {
  musicVolume: number
  setMusicVolume: (volume: number) => void
  isMusicMuted: boolean
  setIsMusicMuted: (muted: boolean) => void
  toggleMute: () => void
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

  const [musicVolume, setMusicVolume] = useState(65)
  const [isMusicMuted, setIsMusicMuted] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [musicReady, setMusicReady] = useState(false)
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  
  // Use refs to track latest values for event handlers
  const musicVolumeRef = useRef(musicVolume)
  const isMusicMutedRef = useRef(isMusicMuted)
  
  useEffect(() => {
    musicVolumeRef.current = musicVolume
  }, [musicVolume])
  
  useEffect(() => {
    isMusicMutedRef.current = isMusicMuted
  }, [isMusicMuted])

  // Check if we're on an admin page
  const isAdminPage = pathname?.startsWith('/admin') || pathname?.startsWith('/sadmin')

  // Playlist of 5 songs to cycle through
  const playlist = useMemo(() => [
    '/newsong.mp3',
    '/music/rapsong.mp3',
    '/music/abysssummon2.mp3',
    '/music/summon2.mp3',
    '/music/summon.mp3',
    '/music/The Damned 3.mp3',
  ], [])

  // Set up audio element once on mount
  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    
    // Set initial volume
    audio.volume = musicVolume / 100
    // Load first song immediately
    if (playlist.length > 0) {
      audio.src = playlist[currentSongIndex]
      lastLoadedSongRef.current = playlist[currentSongIndex]
      audio.load()
    }

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
    }

    const handleUserInteraction = () => {
      // Try to play if audio is ready and paused
      const currentAudio = audioRef.current
      if (!currentAudio) return
      
      // Ensure we have a src loaded
      if (!currentAudio.src && playlist.length > 0) {
        currentAudio.src = playlist[currentSongIndex]
        currentAudio.load()
      }
      
      // Set volume based on current state (using refs to get latest values)
      const muted = isMusicMutedRef.current
      const vol = musicVolumeRef.current
      const targetVolume = muted ? 0 : vol / 100
      currentAudio.volume = targetVolume
      
      if (currentAudio.paused && !muted && targetVolume > 0) {
        // If audio isn't ready yet, wait for it
        if (currentAudio.readyState >= 2) {
          currentAudio.play().catch((error) => {
            console.log('Play attempt blocked:', error)
          })
        } else {
          // Wait for audio to be ready, then play
          const playWhenReady = () => {
            const audio = audioRef.current
            const currentMuted = isMusicMutedRef.current
            const currentVol = musicVolumeRef.current
            if (audio && audio.paused && !currentMuted && currentVol > 0) {
              audio.volume = currentVol / 100
              audio.play().catch((error) => {
                console.log('Play attempt blocked:', error)
              })
            }
          }
          currentAudio.addEventListener('canplay', playWhenReady, { once: true })
          currentAudio.addEventListener('loadeddata', playWhenReady, { once: true })
        }
      }
    }

    // Listen for user interactions to enable playback (not just once - allow retries)
    document.addEventListener('click', handleUserInteraction)
    document.addEventListener('touchstart', handleUserInteraction)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('canplay', handleCanPlay)
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

    // Always set the src (this will load the first song on mount)
    if (lastLoadedSongRef.current !== newSrc || !lastLoadedSongRef.current) {
      lastLoadedSongRef.current = newSrc
      audio.src = newSrc
      audio.volume = isMusicMuted ? 0 : musicVolume / 100
      audio.load()

      // Auto-play if we should continue the playlist (user started it and it hasn't been manually paused)
      if (shouldContinuePlaylistRef.current && !isMusicMuted && audio.volume > 0) {
        const playOnLoad = () => {
          const currentAudio = audioRef.current
          if (currentAudio && currentAudio.paused && shouldContinuePlaylistRef.current && !isMusicMuted) {
            currentAudio.play().catch((error) => {
              console.log('Auto-play blocked:', error)
            })
          }
        }
        audio.addEventListener('loadeddata', playOnLoad, { once: true })
        audio.addEventListener('canplay', playOnLoad, { once: true })
      }
    }
  }, [currentSongIndex, playlist, isMusicMuted, musicVolume])

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

  // Handle volume changes - update immediately when mute state changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    
    // Immediately set volume to 0 when muted, restore volume when unmuted
    if (isMusicMuted) {
      audio.volume = 0
    } else {
      audio.volume = musicVolume / 100
    }

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

  // Direct toggle mute function that immediately updates audio
  const toggleMute = () => {
    const audio = audioRef.current
    const newMutedState = !isMusicMuted
    setIsMusicMuted(newMutedState)
    
    // Immediately update audio volume without waiting for useEffect
    if (audio) {
      if (newMutedState) {
        audio.volume = 0
      } else {
        audio.volume = musicVolume / 100
      }
    }
  }

  const value = {
    musicVolume,
    setMusicVolume,
    isMusicMuted,
    setIsMusicMuted,
    toggleMute,
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

