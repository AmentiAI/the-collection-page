'use client'

import { useEffect } from 'react'

export default function BloodCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('bloodCanvas') as HTMLCanvasElement
    if (!canvas) return

    const ctx = canvas.getContext('2d', { 
      alpha: true,
      desynchronized: true,
      willReadFrequently: false
    })
    if (!ctx) return

    // Optimize canvas settings for performance
    ctx.imageSmoothingEnabled = false // Faster when disabled
    
    // Cache canvas dimensions to avoid expensive getBoundingClientRect calls
    let canvasWidth = window.innerWidth
    let canvasHeight = window.innerHeight
    let dpr = window.devicePixelRatio || 1
    
    const updateCanvasSize = () => {
      dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvasWidth = rect.width
      canvasHeight = rect.height
      canvas.width = canvasWidth * dpr
      canvas.height = canvasHeight * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
      ctx.scale(dpr, dpr)
      canvas.style.width = canvasWidth + 'px'
      canvas.style.height = canvasHeight + 'px'
    }

    updateCanvasSize()

    class BloodDrop {
      x: number = 0
      y: number = 0
      speed: number = 2
      size: number = 8
      opacity: number = 0.5

      constructor() {
        this.reset()
      }

      reset() {
        this.x = Math.random() * canvasWidth
        this.y = -20
        this.speed = 1.5 + Math.random() * 4
        this.size = 5 + Math.random() * 15
        this.opacity = 0.5 + Math.random() * 0.5
      }

      update() {
        this.y += this.speed
        if (this.y > canvasHeight + 20) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return
        
        // Optimized teardrop shape - using gradient for single draw call
        const width = this.size * 0.7
        const height = this.size * 1.8
        
        // Create radial gradient for depth effect (combined shadow + body + highlight)
        const gradient = ctx.createRadialGradient(
          this.x - width * 0.2, 
          this.y + height * 0.3, 
          0,
          this.x, 
          this.y + height * 0.5, 
          height * 0.8
        )
        gradient.addColorStop(0, `rgba(255, 150, 150, ${this.opacity * 0.7})`) // Highlight
        gradient.addColorStop(0.4, `rgba(180, 0, 0, ${this.opacity})`) // Main body
        gradient.addColorStop(0.7, `rgba(139, 0, 0, ${this.opacity * 0.9})`) // Darker middle
        gradient.addColorStop(1, `rgba(100, 0, 0, ${this.opacity * 0.8})`) // Shadow edge
        
        ctx.fillStyle = gradient
        ctx.beginPath()
        // Simplified teardrop using fewer curves (quadratic instead of bezier)
        ctx.moveTo(this.x, this.y)
        ctx.quadraticCurveTo(this.x - width * 0.4, this.y + height * 0.5, this.x - width * 0.35, this.y + height * 0.9)
        ctx.quadraticCurveTo(this.x - width * 0.2, this.y + height * 1.0, this.x, this.y + height)
        ctx.quadraticCurveTo(this.x + width * 0.2, this.y + height * 1.0, this.x + width * 0.35, this.y + height * 0.9)
        ctx.quadraticCurveTo(this.x + width * 0.4, this.y + height * 0.5, this.x, this.y)
        ctx.closePath()
        ctx.fill()
      }
    }

    const maxDrops = 65
    const bloodDrops: BloodDrop[] = []

    for (let i = 0; i < maxDrops; i++) {
      bloodDrops.push(new BloodDrop())
    }

    let animationFrameId: number
    let isRunning = true

    const animate = () => {
      if (!ctx || !isRunning) return
      
      // Clear entire canvas - no trail effect for better performance
      ctx.clearRect(0, 0, canvasWidth, canvasHeight)

      // Batch update first, then batch draw for better performance
      const visibleDrops: BloodDrop[] = []
      bloodDrops.forEach(drop => {
        drop.update()
        // Only draw drops that are visible on screen
        if (drop.y > -50 && drop.y < canvasHeight + 50) {
          visibleDrops.push(drop)
        }
      })
      
      // Draw only visible drops
      visibleDrops.forEach(drop => drop.draw())

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      // Debounce resize to avoid excessive canvas resets
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        updateCanvasSize()
        // Reset drops on resize
        bloodDrops.forEach(drop => drop.reset())
      }, 100)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      isRunning = false
      clearTimeout(resizeTimeout)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  return (
    <canvas
      id="bloodCanvas"
      className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-80 z-0"
      style={{ transform: 'none' }}
    />
  )
}