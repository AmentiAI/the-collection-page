'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'

type FaceProgressRecord = {
  face_id: number
  progress: number
  is_unlocked: boolean
  is_completed: boolean
}

type UserChoicesState = {
  earned_sigils: string[]
}

const STORAGE_KEY_PREFIX = 'voidbox-progress-state-v2'

const DEFAULT_USER_CHOICES: UserChoicesState = {
  earned_sigils: [],
}

const EMPTY_FACE_PROGRESS: FaceProgressRecord[] = []

type StoredState = {
  faceProgress: FaceProgressRecord[]
  userChoices: UserChoicesState
}

function getStorageKey(walletAddress?: string | null) {
  return `${STORAGE_KEY_PREFIX}:${walletAddress ? walletAddress.toLowerCase() : 'guest'}`
}

function normalizeStoredState(value: unknown): StoredState {
  if (!value || typeof value !== 'object') {
    return { faceProgress: EMPTY_FACE_PROGRESS, userChoices: DEFAULT_USER_CHOICES }
  }

  const record = value as Partial<StoredState>

  const faceProgress = Array.isArray(record.faceProgress)
    ? record.faceProgress.filter((item): item is FaceProgressRecord => {
        return (
          item !== null &&
          typeof item === 'object' &&
          typeof (item as any).face_id === 'number' &&
          typeof (item as any).progress === 'number' &&
          typeof (item as any).is_unlocked === 'boolean' &&
          typeof (item as any).is_completed === 'boolean'
        )
      })
    : EMPTY_FACE_PROGRESS

  const userChoices = record.userChoices && Array.isArray(record.userChoices.earned_sigils)
    ? { earned_sigils: [...record.userChoices.earned_sigils] }
    : { ...DEFAULT_USER_CHOICES }

  return {
    faceProgress,
    userChoices,
  }
}

export function useVoidboxProgress() {
  const { currentAddress } = useWallet()
  const normalizedAddress = currentAddress ? currentAddress.toLowerCase() : null
  const storageKey = getStorageKey(normalizedAddress)

  const [loading, setLoading] = useState(true)
  const [faceProgressState, setFaceProgressState] = useState<FaceProgressRecord[]>(EMPTY_FACE_PROGRESS)
  const [userChoicesState, setUserChoicesState] = useState<UserChoicesState>(DEFAULT_USER_CHOICES)
  const [isOnline, setIsOnline] = useState(true)
  const [hasRemoteSync, setHasRemoteSync] = useState(false)

  const faceProgressRef = useRef(faceProgressState)
  const userChoicesRef = useRef(userChoicesState)

  const saveToLocal = useCallback((nextFaceProgress: FaceProgressRecord[], nextUserChoices: UserChoicesState) => {
    if (typeof window === 'undefined') return

    try {
      const payload: StoredState = {
        faceProgress: nextFaceProgress,
        userChoices: nextUserChoices,
      }
      window.localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch (error) {
      console.error('Failed to persist voidbox progress locally:', error)
    }
  }, [storageKey])

  const syncRemote = useCallback(async (nextFaceProgress: FaceProgressRecord[], nextUserChoices: UserChoicesState) => {
    if (!normalizedAddress) {
      setHasRemoteSync(false)
      return
    }

    try {
      const response = await fetch('/api/voidbox/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: normalizedAddress,
          faceProgress: nextFaceProgress,
          earnedSigils: nextUserChoices.earned_sigils,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to sync voidbox progress: ${response.status}`)
      }

      setHasRemoteSync(true)
    } catch (error) {
      console.error('Failed to sync voidbox progress remotely:', error)
      setHasRemoteSync(false)
    }
  }, [normalizedAddress])

  const persistState = useCallback((nextFaceProgress: FaceProgressRecord[], nextUserChoices: UserChoicesState) => {
    faceProgressRef.current = nextFaceProgress
    userChoicesRef.current = nextUserChoices

    saveToLocal(nextFaceProgress, nextUserChoices)
    void syncRemote(nextFaceProgress, nextUserChoices)
  }, [saveToLocal, syncRemote])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadLocalState = () => {
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) {
          setFaceProgressState(EMPTY_FACE_PROGRESS)
          setUserChoicesState(DEFAULT_USER_CHOICES)
          faceProgressRef.current = EMPTY_FACE_PROGRESS
          userChoicesRef.current = DEFAULT_USER_CHOICES
          return
        }

        const parsed = JSON.parse(raw) as unknown
        const normalized = normalizeStoredState(parsed)

        setFaceProgressState(normalized.faceProgress)
        setUserChoicesState(normalized.userChoices)
        faceProgressRef.current = normalized.faceProgress
        userChoicesRef.current = normalized.userChoices
      } catch (error) {
        console.error('Failed to load voidbox progress from local storage:', error)
        setFaceProgressState(EMPTY_FACE_PROGRESS)
        setUserChoicesState(DEFAULT_USER_CHOICES)
        faceProgressRef.current = EMPTY_FACE_PROGRESS
        userChoicesRef.current = DEFAULT_USER_CHOICES
      }
    }

    const loadRemoteState = async () => {
      if (!normalizedAddress) {
        setHasRemoteSync(false)
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const response = await fetch(`/api/voidbox/state?walletAddress=${encodeURIComponent(normalizedAddress)}`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch remote voidbox progress: ${response.status}`)
        }

        const data = await response.json()

        if (cancelled) return

        const remoteState: StoredState = normalizeStoredState({
          faceProgress: data.faceProgress,
          userChoices: { earned_sigils: data.earnedSigils },
        })

        setFaceProgressState(remoteState.faceProgress)
        setUserChoicesState(remoteState.userChoices)
        faceProgressRef.current = remoteState.faceProgress
        userChoicesRef.current = remoteState.userChoices
        saveToLocal(remoteState.faceProgress, remoteState.userChoices)
        setHasRemoteSync(true)
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load voidbox progress from server:', error)
          setHasRemoteSync(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadLocalState()
    void loadRemoteState()

    return () => {
      cancelled = true
    }
  }, [normalizedAddress, storageKey, saveToLocal])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    setIsOnline(window.navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const updateFaceProgress = useCallback(async (faceId: number, updates: Partial<FaceProgressRecord>) => {
    setFaceProgressState((previous) => {
      const existing = previous.find((item) => item.face_id === faceId)
      const base: FaceProgressRecord = existing ?? {
        face_id: faceId,
        progress: 0,
        is_unlocked: false,
        is_completed: false,
      }

      const nextRecord: FaceProgressRecord = {
        ...base,
        ...updates,
        face_id: faceId,
      }

      const filtered = previous.filter((item) => item.face_id !== faceId)
      const nextFaceProgress = [...filtered, nextRecord].sort((a, b) => a.face_id - b.face_id)

      persistState(nextFaceProgress, userChoicesRef.current)

      return nextFaceProgress
    })
  }, [persistState])

  const addEarnedSigil = useCallback(async (sigil: string) => {
    setUserChoicesState((previous) => {
      if (previous.earned_sigils.includes(sigil)) {
        persistState(faceProgressRef.current, previous)
        return previous
      }

      const nextUserChoices: UserChoicesState = {
        ...previous,
        earned_sigils: [...previous.earned_sigils, sigil],
      }

      persistState(faceProgressRef.current, nextUserChoices)

      return nextUserChoices
    })
  }, [persistState])

  const removeEarnedSigil = useCallback(async (sigil: string) => {
    setUserChoicesState((previous) => {
      const nextUserChoices: UserChoicesState = {
        ...previous,
        earned_sigils: previous.earned_sigils.filter((item) => item !== sigil),
      }

      persistState(faceProgressRef.current, nextUserChoices)

      return nextUserChoices
    })
  }, [persistState])

  return {
    loading,
    faceProgress: faceProgressState,
    userChoices: userChoicesState,
    updateFaceProgress,
    addEarnedSigil,
    removeEarnedSigil,
    isOnline,
    hasRemoteSync,
  }
}
