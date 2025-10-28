'use client'

import { useEffect, useRef, useState } from 'react'

interface BackgroundMusicProps {
  shouldPlay: boolean
  onInteraction?: () => void
}

export default function BackgroundMusic({ shouldPlay, onInteraction }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTrack, setCurrentTrack] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const playlist = [
    '/music/Shadows creeping through the door (1).mp3',
    '/music/The Damned.mp3',
    '/music/The Damned 3.mp3'
  ]

  // Set volume
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.3
  }, [])

  // Handle track end and play next track
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isPlaying) return

    const handleEnded = () => {
      const nextTrack = (currentTrack + 1) % playlist.length
      audio.src = playlist[nextTrack]
      audio.load()
      audio.play()
        .then(() => {
          setCurrentTrack(nextTrack)
          console.log('Playing track:', nextTrack + 1)
        })
        .catch(err => console.log('Play next track failed:', err))
    }

    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [currentTrack, isPlaying, playlist])

  // Start playing when shouldPlay becomes true
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (shouldPlay && !isPlaying) {
      audio.src = playlist[currentTrack]
      audio.load()
      const playPromise = audio.play()
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true)
            console.log('Music playing track:', currentTrack + 1)
          })
          .catch(err => {
            console.log('Play failed, waiting for user interaction:', err)
            if (onInteraction) {
              onInteraction()
            }
          })
      }
    } else if (!shouldPlay && isPlaying) {
      audio.pause()
      setIsPlaying(false)
    }
  }, [shouldPlay, isPlaying, currentTrack, playlist, onInteraction])

  // Allow click to start if autoplay was blocked
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleClick = () => {
      if (!isPlaying && shouldPlay) {
        audio.src = playlist[currentTrack]
        audio.load()
        audio.play()
          .then(() => {
            setIsPlaying(true)
          })
          .catch(err => console.log('Play on click failed:', err))
      }
    }

    window.addEventListener('click', handleClick, { once: true })
    return () => window.removeEventListener('click', handleClick)
  }, [isPlaying, shouldPlay, currentTrack, playlist])

  return (
    <audio
      ref={audioRef}
      preload="auto"
    />
  )
}