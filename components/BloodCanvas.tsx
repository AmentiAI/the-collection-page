'use client'

import { useEffect } from 'react'

export default function BloodCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('bloodCanvas') as HTMLCanvasElement
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
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
        this.x = Math.random() * canvas.width
        this.y = -10
        this.speed = 2 + Math.random() * 3
        this.length = 20 + Math.random() * 40
        this.opacity = 0.5 + Math.random() * 0.5
      }

      update() {
        this.y += this.speed
        if (this.y > canvas.height) {
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

    const animate = () => {
      if (!ctx) return
      ctx.fillStyle = 'rgba(10, 10, 10, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      bloodDrops.forEach(drop => {
        drop.update()
        drop.draw()
      })

      requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      updateCanvasSize()
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
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
