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

    // Optimize canvas settings
    ctx.imageSmoothingEnabled = false
    
    let dpr = 1
    const updateCanvasSize = () => {
      dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
      ctx.scale(dpr, dpr)
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
    }

    updateCanvasSize()

    class BloodDrop {
      x: number = 0
      y: number = 0
      speed: number = 2
      length: number = 20
      opacity: number = 0.5

      constructor() {
        this.reset()
      }

      reset() {
        const rect = canvas.getBoundingClientRect()
        this.x = Math.random() * rect.width
        this.y = -10
        this.speed = 2 + Math.random() * 3
        this.length = 20 + Math.random() * 40
        this.opacity = 0.6 + Math.random() * 0.4
      }

      update() {
        this.y += this.speed
        const rect = canvas.getBoundingClientRect()
        if (this.y > rect.height) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return
        ctx.strokeStyle = `rgba(139, 0, 0, ${this.opacity})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(this.x, this.y)
        ctx.lineTo(this.x, this.y + this.length)
        ctx.stroke()

        ctx.fillStyle = `rgba(139, 0, 0, ${this.opacity})`
        ctx.beginPath()
        ctx.arc(this.x, this.y + this.length, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const maxDrops = 35
    const bloodDrops: BloodDrop[] = []

    for (let i = 0; i < maxDrops; i++) {
      bloodDrops.push(new BloodDrop())
    }

    let animationFrameId: number
    let lastTime = 0
    const fps = 60
    const frameInterval = 1000 / fps

    const animate = (currentTime: number) => {
      if (!ctx) return
      
      const deltaTime = currentTime - lastTime
      
      if (deltaTime >= frameInterval) {
        // Clear entire canvas properly (use scaled dimensions)
        const rect = canvas.getBoundingClientRect()
        ctx.clearRect(0, 0, rect.width, rect.height)
        
        // Draw trail effect more efficiently
        ctx.fillStyle = 'rgba(10, 10, 10, 0.08)'
        ctx.fillRect(0, 0, rect.width, rect.height)

        bloodDrops.forEach(drop => {
          drop.update()
          drop.draw()
        })

        lastTime = currentTime - (deltaTime % frameInterval)
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    const handleResize = () => {
      updateCanvasSize()
      // Reset drops on resize
      bloodDrops.forEach(drop => drop.reset())
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
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
