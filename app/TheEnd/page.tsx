'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import { useMusicPlayer } from '@/providers/MusicPlayerProvider'
import RouletteWheel from '@/components/RouletteWheel'

export default function TheEndPage() {
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)
  const [showHeader, setShowHeader] = useState(false)
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set())
  const [clickedPhotos, setClickedPhotos] = useState<Set<number>>(new Set())
  const [showEndFile, setShowEndFile] = useState(false)
  const [showFinalMessage, setShowFinalMessage] = useState(false)
  const [showNav, setShowNav] = useState(false)
  const [currentFileIndex, setCurrentFileIndex] = useState<number | null>(null)
  const [hoveredFileIndex, setHoveredFileIndex] = useState<number | null>(null)
  const [showSecretQuotes, setShowSecretQuotes] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const jumpScareAudioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowNav(true)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  const revealWord = (word: string) => {
    setRevealedWords((prev) => new Set(prev).add(word))
  }

  const handlePhotoClick = (index: number) => {
    setClickedPhotos((prev) => new Set(prev).add(index))
    setTimeout(() => {
      setClickedPhotos((prev) => {
        const newSet = new Set(prev)
        newSet.delete(index)
        return newSet
      })
    }, 300)
  }

  const handleJumpScare = () => {
    // Play jump scare sound
    if (jumpScareAudioRef.current) {
      jumpScareAudioRef.current.currentTime = 0
      jumpScareAudioRef.current.volume = 1.0
      jumpScareAudioRef.current.play().catch((error) => {
        console.error('Error playing jump scare:', error)
      })
    }
    // Show the final message after jump scare
    setTimeout(() => {
      setShowEndFile(true)
      setShowFinalMessage(true)
    }, 100)
  }

  const classifiedFiles = [
    {
      id: 'DAMNED-001',
      title: 'INITIAL THREAT ASSESSMENT',
      status: 'TERMINATED',
      threatLevel: 'EXTREME / WORLD-ENDING',
      redactedTexts: [
        { text: 'First contact with The Damned happened at', redacted: '[REDACTED]', reveal: 'a place called The Abyss' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'People were burning things there—', redacted: '[REDACTED]', reveal: 'sacred objects' },
        { text: '—and The Damned started', redacted: '[REDACTED]', reveal: 'waking up' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Damned have strange powers including', redacted: '[REDACTED]', reveal: 'time breaking' },
        { text: ',', redacted: '', reveal: '' },
        { text: 'changing reality', redacted: '[REDACTED]', reveal: 'mind swapping' },
        { text: ', and', redacted: '[REDACTED]', reveal: 'calling monsters from the void' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'Witnesses saw', redacted: '[REDACTED]', reveal: 'The Damned come out of shadows' },
        { text: 'and', redacted: '[REDACTED]', reveal: 'giant creatures following them' },
        { text: '—we call these', redacted: '[REDACTED]', reveal: 'The Horde' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Horde attacks', redacted: '[REDACTED]', reveal: 'every hour' },
        { text: 'and gets stronger each time', redacted: '[REDACTED]', reveal: 'The Damned complete a ritual' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'Our teams report', redacted: '[REDACTED]', reveal: 'being watched by The Damned from their own reflections' },
        { text: 'and', redacted: '[REDACTED]', reveal: 'hearing The Damned speak in languages that do not exist' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'We think The Damned want to', redacted: '[REDACTED]', reveal: 'tear open the wall between worlds' },
        { text: 'and', redacted: '[REDACTED]', reveal: 'let The Horde through completely' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'THE DAMNED ARE NOT HUMAN.', redacted: '', reveal: '' },
        { text: 'THE DAMNED ARE THE END.', redacted: '', reveal: '' },
      ],
      additionalNotes: 'First time we saw The Damned: ████████. Everyone who saw The Damned ████████ within 72 hours. The place ████████ is locked down forever. The Abyss is now under ████████ lockdown.'
    },
    {
      id: 'DAMNED-002',
      title: 'RITUAL ANALYSIS & PROGRESSION',
      status: 'ACTIVE',
      threatLevel: 'CRITICAL / IMMINENT',
      redactedTexts: [
        { text: 'The Damned ritual needs', redacted: '[REDACTED]', reveal: 'ten' },
        { text: 'sacrifices at', redacted: '[REDACTED]', reveal: 'ten' },
        { text: 'special spots around', redacted: '[REDACTED]', reveal: 'the world' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'How many The Damned have done:', redacted: '[REDACTED]', reveal: 'nine of ten' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'Last spot is at', redacted: '[REDACTED]', reveal: 'we do not know where' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'Each Damned ritual makes', redacted: '[REDACTED]', reveal: 'reality break' },
        { text: 'in those areas. People saw', redacted: '[REDACTED]', reveal: 'multiple versions of themselves' },
        { text: 'and', redacted: '[REDACTED]', reveal: 'time moving backwards' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'After each ritual,', redacted: '[REDACTED]', reveal: 'more of The Horde appears' },
        { text: 'and', redacted: '[REDACTED]', reveal: 'The Gates of The Damned open wider' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Damned last ritual will', redacted: '[REDACTED]', reveal: 'break down the wall between worlds' },
        { text: 'and', redacted: '[REDACTED]', reveal: 'let all of The Horde through at once' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'People are helping The Damned by', redacted: '[REDACTED]', reveal: 'burning things in The Abyss' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'Each burn makes', redacted: '[REDACTED]', reveal: 'The Damned stronger' },
        { text: 'and', redacted: '[REDACTED]', reveal: 'brings The Horde closer' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'How long until The Damned finish:', redacted: '[REDACTED]', reveal: 'we do not know' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'THE DAMNED ARE NOT HUMAN.', redacted: '', reveal: '' },
        { text: 'THE DAMNED ARE THE END.', redacted: '', reveal: '' },
      ],
      additionalNotes: 'Ritual spots marked with symbol 𝔇 by The Damned. All spots show ████████ poison. People watching The Damned report ████████. The Horde grows larger after each ritual.'
    },
    {
      id: 'DAMNED-003',
      title: 'FINAL TRANSMISSION & WARNING',
      status: 'CLASSIFIED',
      threatLevel: 'BEYOND CLASSIFICATION',
      redactedTexts: [
        { text: 'This is', redacted: '[REDACTED]', reveal: 'Agent ████████' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'Last message before', redacted: '[REDACTED]', reveal: 'The Damned destroyed everything' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Damned know we', redacted: '[REDACTED]', reveal: 'exist' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Damned know we', redacted: '[REDACTED]', reveal: 'are watching' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'Every time we try to', redacted: '[REDACTED]', reveal: 'stop The Damned' },
        { text: 'The Damned', redacted: '[REDACTED]', reveal: 'see it coming and stop us' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Horde is not', redacted: '[REDACTED]', reveal: 'separate from The Damned' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Horde is', redacted: '[REDACTED]', reveal: 'part of The Damned' },
        { text: '—', redacted: '', reveal: '' },
        { text: 'their army', redacted: '[REDACTED]', reveal: 'their vanguard' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Damned are not', redacted: '[REDACTED]', reveal: 'from another world' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Damned are', redacted: '[REDACTED]', reveal: 'from before worlds existed' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Damned ritual is not', redacted: '[REDACTED]', reveal: 'calling them here' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'It is', redacted: '[REDACTED]', reveal: 'waking The Damned up' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Abyss is not', redacted: '[REDACTED]', reveal: 'a place' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'The Abyss is', redacted: '[REDACTED]', reveal: 'a gateway' },
        { text: '—', redacted: '', reveal: '' },
        { text: 'a door The Damned are', redacted: '[REDACTED]', reveal: 'forcing open' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'If you get this,', redacted: '[REDACTED]', reveal: 'burn all records of The Damned' },
        { text: '.', redacted: '', reveal: '' },
        { text: 'THE DAMNED ARE ALREADY HERE.', redacted: '', reveal: '' },
        { text: 'THE HORDE IS COMING.', redacted: '', reveal: '' },
        { text: 'THE END IS', redacted: '', reveal: '' },
        { text: 'THE DAMNED.', redacted: '', reveal: '' },
      ],
      additionalNotes: 'Message received: ████████. From: ████████. Every time we try to reach ████████ The Damned stop it. Status: ████████. The Gates are ████████. The Horde count: ████████.'
    }
  ]

  const redactedTexts = currentFileIndex !== null && classifiedFiles[currentFileIndex] ? classifiedFiles[currentFileIndex].redactedTexts || [] : []

  const photos = [
    { 
      id: 1, 
      alt: 'Blurry figure with glowing red eyes', 
      location: 'Alley', 
      description: 'UNIDENTIFIED ENTITY',
      image: '/New folder (13)/1ab9dc00-6ebf-4151-9732-2aa947f6ebf3.png',
      lore: 'Taken by Agent ████████ right before they vanished near The Abyss. One of The Damned looks right at the camera even though it was 200 meters away. Behind The Damned, you can see shapes moving—we think these are The Horde. Everyone there felt like The Damned were watching them from inside their own heads.'
    },
    { 
      id: 2, 
      alt: 'Burned ritual circle', 
      location: 'Forest', 
      description: 'RITUAL SITE',
      image: '/New folder (14)/845517ec-55b5-41de-ba98-424f34605837.png',
      lore: 'Found in ████████ National Forest. One of The Damned ritual sites—the ninth of ten. The ground was 400°F hot but there was no fire. Trees within 50 meters were turned to stone, then to ash by The Damned. After this ritual, The Horde started appearing more often. The symbols match old writings from before humans existed.'
    },
    { 
      id: 3, 
      alt: 'Silhouette over lake', 
      location: 'Lake', 
      description: 'WITNESSED PHENOMENON',
      image: '/New folder (15)/22cac01d-a7bd-4b33-b2d8-a9abe414c8f9.png',
      lore: 'Taken during Operation ████████ near where people were burning things in The Abyss. One of The Damned looks like it is standing on the water. Many people say The Damned was not there when the photo was taken, it only showed up in the picture. The lake tested positive for ████████ poison left by The Damned. We think The Damned were watching the burns happen.'
    },
    { 
      id: 4, 
      alt: 'Distorted smile mask', 
      location: 'Mud', 
      description: 'ARTIFACT RECOVERED',
      image: '/New folder (16)/67e37dc9-d15a-49c7-aa68-4240e433822c.png',
      lore: 'Found at ████████ site where The Damned were seen, close to The Gates. Made of something we do not know—not like anything we have seen. The Damned mask looks like it breathes when you look at it. Everyone who touched The Damned artifact reported ████████ within 48 hours. Now locked away in ████████ facility. We think it might be connected to The Horde somehow.'
    },
  ]

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="relative min-h-screen bg-black text-red-600 overflow-x-hidden">
      
      {/* Cool animated background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-red-950 to-black"></div>
        <div className="absolute inset-0" style={{
          backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(220, 38, 38, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(139, 0, 0, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.05) 0%, transparent 100%)
          `,
        }}></div>
        {/* Animated grid pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(220, 38, 38, 0.1) 2px, rgba(220, 38, 38, 0.1) 4px),
                           repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(220, 38, 38, 0.1) 2px, rgba(220, 38, 38, 0.1) 4px)`,
          backgroundSize: '100px 100px',
        }}></div>
        {/* Subtle pulsing glow */}
        <div className="absolute inset-0 bg-red-600 opacity-5 animate-pulse"></div>
      </div>

      <style jsx global>{`
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          25% { opacity: 0.1; }
          50% { opacity: 0.8; }
          75% { opacity: 0.3; }
        }
        @keyframes glitch {
          0% { 
            transform: translate(0);
            filter: hue-rotate(0deg);
          }
          10% { 
            transform: translate(-3px, 3px);
            filter: hue-rotate(90deg);
          }
          20% { 
            transform: translate(3px, -3px);
            filter: hue-rotate(180deg);
          }
          30% { 
            transform: translate(-3px, -3px);
            filter: hue-rotate(270deg);
          }
          40% { 
            transform: translate(3px, 3px);
            filter: hue-rotate(360deg);
          }
          50% { 
            transform: translate(-2px, 2px);
            filter: hue-rotate(0deg);
          }
          60% { 
            transform: translate(2px, -2px);
            filter: hue-rotate(90deg);
          }
          70% { 
            transform: translate(-2px, -2px);
            filter: hue-rotate(180deg);
          }
          80% { 
            transform: translate(2px, 2px);
            filter: hue-rotate(270deg);
          }
          90% { 
            transform: translate(-1px, 1px);
            filter: hue-rotate(360deg);
          }
          100% { 
            transform: translate(0);
            filter: hue-rotate(0deg);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-2px, -2px) rotate(-1deg); }
          20% { transform: translate(2px, 2px) rotate(1deg); }
          30% { transform: translate(-2px, 2px) rotate(-1deg); }
          40% { transform: translate(2px, -2px) rotate(1deg); }
          50% { transform: translate(-2px, -2px) rotate(-1deg); }
          60% { transform: translate(2px, 2px) rotate(1deg); }
          70% { transform: translate(-2px, 2px) rotate(-1deg); }
          80% { transform: translate(2px, -2px) rotate(1deg); }
          90% { transform: translate(-2px, -2px) rotate(-1deg); }
        }
        @keyframes bloodDrop {
          0% { 
            transform: translateY(-100px) scale(0);
            opacity: 0;
          }
          10% { 
            opacity: 1;
            transform: translateY(-50px) scale(1);
          }
          50% { 
            opacity: 1;
            transform: translateY(50vh) scale(1.2);
          }
          100% { 
            transform: translateY(100vh) scale(0.8);
            opacity: 0;
          }
        }
        @keyframes typewriter {
          from { 
            width: 0;
            border-right: 2px solid #dc2626;
          }
          to { 
            width: 100%;
            border-right: 2px solid transparent;
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(220, 38, 38, 0.5),
                        0 0 40px rgba(220, 38, 38, 0.3),
                        0 0 60px rgba(220, 38, 38, 0.1);
          }
          50% { 
            box-shadow: 0 0 30px rgba(220, 38, 38, 0.8),
                        0 0 60px rgba(220, 38, 38, 0.5),
                        0 0 90px rgba(220, 38, 38, 0.2);
          }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes corrupt {
          0% { filter: blur(0px); opacity: 1; }
          50% { filter: blur(2px); opacity: 0.7; }
          100% { filter: blur(0px); opacity: 1; }
        }
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
        @keyframes textGlow {
          0%, 100% { 
            text-shadow: 0 0 10px #dc2626, 0 0 20px #dc2626, 0 0 30px #dc2626;
          }
          50% { 
            text-shadow: 0 0 20px #dc2626, 0 0 30px #dc2626, 0 0 40px #dc2626, 0 0 50px #8b0000;
          }
        }
        @keyframes bloodDrip {
          0% {
            transform: translateY(0);
            opacity: 0.7;
          }
          50% {
            transform: translateY(4px);
            opacity: 0.9;
          }
          100% {
            transform: translateY(8px);
            opacity: 0.5;
          }
        }
        @keyframes bloodPulse {
          0%, 100% {
            text-shadow: 
              0 0 20px rgba(139, 0, 0, 0.8),
              0 0 40px rgba(220, 38, 38, 0.6),
              2px 2px 8px rgba(0, 0, 0, 0.9),
              4px 4px 12px rgba(139, 0, 0, 0.7),
              0 0 60px rgba(220, 38, 38, 0.4);
            filter: drop-shadow(0 0 10px rgba(220, 38, 38, 0.8));
          }
          50% {
            text-shadow: 
              0 0 30px rgba(139, 0, 0, 1),
              0 0 60px rgba(220, 38, 38, 0.8),
              2px 2px 8px rgba(0, 0, 0, 0.9),
              6px 6px 16px rgba(139, 0, 0, 0.9),
              0 0 80px rgba(220, 38, 38, 0.6);
            filter: drop-shadow(0 0 15px rgba(220, 38, 38, 1));
          }
        }
        @keyframes fileHover {
          0% {
            transform: translateY(0px) scale(1);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
          }
          100% {
            transform: translateY(-20px) scale(1.08);
            box-shadow: 0 40px 80px rgba(139, 0, 0, 0.6), 0 0 60px rgba(220, 38, 38, 0.4);
          }
        }
        @keyframes stampPulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 6px 25px rgba(139, 0, 0, 0.8), 0 0 20px rgba(220, 38, 38, 0.6);
          }
        }
        @keyframes fileGlow {
          0%, 100% {
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 
                        inset 0 0 120px rgba(139, 69, 19, 0.1),
                        0 0 0 rgba(220, 38, 38, 0);
          }
          50% {
            box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5), 
                        inset 0 0 120px rgba(139, 69, 19, 0.2),
                        0 0 40px rgba(220, 38, 38, 0.5),
                        0 0 60px rgba(139, 0, 0, 0.3);
          }
        }
        .file-paper-hover {
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .file-paper-hover:hover .file-paper-content,
        .file-paper-hover.is-hovered .file-paper-content {
          animation: fileGlow 1.5s ease-in-out infinite;
        }
        .file-paper-hover:hover .classified-stamp,
        .file-paper-hover.is-hovered .classified-stamp {
          animation: stampPulse 0.8s ease-in-out infinite;
        }
        .file-paper-hover:hover .the-damned-text,
        .file-paper-hover.is-hovered .the-damned-text {
          animation: textGlow 1s ease-in-out infinite;
        }
        .file-paper-hover:hover .file-shadow,
        .file-paper-hover.is-hovered .file-shadow {
          opacity: 0.6;
          transform: translateX(-50%) scale(1.3);
          filter: blur(20px);
        }
        .flicker { animation: flicker 0.3s infinite; }
        .glitch { animation: glitch 0.4s infinite; }
        .shake { animation: shake 0.5s; }
        .pulse { animation: pulse 2s ease-in-out infinite; }
        .corrupt { animation: corrupt 0.5s infinite; }
        .text-glow { animation: textGlow 2s ease-in-out infinite; }
        .blood-drop {
          position: absolute;
          width: 6px;
          height: 30px;
          background: radial-gradient(circle, #8B0000 0%, #4B0000 100%);
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          filter: blur(1px);
          animation: bloodDrop 3s infinite;
        }
        .redaction-bar {
          display: inline-block;
          background: #000;
          height: 1.3em;
          margin: 0 3px;
          padding: 0 4px;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          position: relative;
        }
        .redaction-bar::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            90deg,
            #000 0px,
            #000 2px,
            #1a0000 2px,
            #1a0000 4px
          );
        }
        .redaction-bar:hover {
          background: transparent !important;
          color: #ff0000 !important;
          text-decoration: underline;
          transform: scale(1.1);
        }
        .redaction-bar:hover::before {
          opacity: 0;
        }
        .polaroid-shake {
          animation: float 3s ease-in-out infinite;
        }
        .photo-zoom {
          transform: scale(2) !important;
          z-index: 1000 !important;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          filter: brightness(1.5) contrast(1.2);
        }
        .scanline {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(to bottom, transparent, rgba(220, 38, 38, 0.5), transparent);
          animation: scanline 8s linear infinite;
          pointer-events: none;
          z-index: 9999;
        }
        .document-paper {
          background: 
            linear-gradient(90deg, transparent 79px, rgba(139, 69, 19, 0.1) 81px, rgba(139, 69, 19, 0.1) 82px, transparent 84px),
            radial-gradient(circle at 20% 30%, rgba(139, 69, 19, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(139, 69, 19, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(139, 69, 19, 0.05) 0%, transparent 100%);
          position: relative;
        }
        .document-paper::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h100v100H0z' fill='%23fef3c7'/%3E%3Cpath d='M0 0h2v100H0z' fill='%23d97706' opacity='0.1'/%3E%3C/svg%3E");
          opacity: 0.3;
          pointer-events: none;
        }
        /* Mobile-specific styles for classified files - ONLY affects mobile */
        @media (max-width: 767px) {
          .classified-files-container {
            min-height: 400px !important;
            overflow-x: auto;
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
            padding-left: 20px;
            padding-right: 20px;
          }
          .classified-file {
            width: 250px !important;
            height: 320px !important;
          }
          .classified-file .file-paper-content {
            border: 6px solid #3e2723 !important;
          }
          .classified-file .classified-stamp {
            border: 3px solid #660000 !important;
            padding: 8px 20px !important;
          }
          .classified-file .classified-stamp p {
            font-size: 1rem !important;
            letter-spacing: 0.1em !important;
          }
          .classified-file .the-damned-text {
            font-size: 0.875rem !important;
            letter-spacing: 0.1em !important;
          }
          .classified-file .file-id-text {
            font-size: 0.875rem !important;
          }
          .classified-file .file-title-text {
            font-size: 0.625rem !important;
          }
        }
      `}</style>

      <div className="scanline"></div>

      {/* Navigation Menu */}
      {showNav && !showHeader && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm">
          <div className="text-center space-y-8 font-mono">
            <div className="mb-12">
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-wider text-red-600 text-glow glitch mb-4">
                THE END FILES
              </h1>
              <p className="text-red-600/60 text-sm md:text-base animate-pulse">SELECT SECTION TO ACCESS</p>
            </div>
            
            <nav className="space-y-4">
              {[
                { id: 'header-screen', label: '[01] CLASSIFIED HEADER', desc: 'ACCESS BREACH DETECTED' },
                { id: 'government-files', label: '[02] GOVERNMENT FILES', desc: 'DAMNED-001 CLASSIFIED' },
                { id: 'sightings', label: '[03] EVIDENCE BOARD', desc: 'PHOTOGRAPHIC EVIDENCE' },
                { id: 'blueprints', label: '[04] RITUAL BLUEPRINTS', desc: 'CLASSIFIED DIAGRAMS' },
                { id: 'corrupted', label: '[05] CORRUPTED ARCHIVES', desc: 'ERROR 666 DETECTED' },
                { id: 'warnings', label: '[06] FINAL WARNINGS', desc: 'BLOOD-SMUDGED NOTES' },
                { id: 'ending', label: '[07] THE REDACTED ENDING', desc: 'END_FILE_OMEGA.TXT' },
              ].map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.id === 'header-screen') {
                      setShowHeader(true)
                      setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }, 100)
                    } else {
                      setShowHeader(true)
                      setTimeout(() => scrollToSection(item.id), 100)
                    }
                  }}
                  className="block w-full text-left px-8 py-4 border-2 border-red-600/50 bg-black/50 hover:bg-red-950/50 hover:border-red-600 transition-all duration-300 group"
                  style={{
                    animation: `fadeIn 0.5s ease-in-out ${idx * 0.1}s both`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-red-600 text-lg md:text-xl font-bold group-hover:text-red-400 transition-colors text-glow">
                        {item.label}
                      </p>
                      <p className="text-red-600/50 text-xs md:text-sm mt-1">{item.desc}</p>
                    </div>
                    <span className="text-red-600/30 group-hover:text-red-600 transition-colors">→</span>
                  </div>
                </button>
              ))}
            </nav>

            <div className="mt-12 pt-8 border-t border-red-600/30">
              <button
                onClick={() => {
                  setShowHeader(true)
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }, 100)
                }}
                className="px-8 py-3 border-2 border-red-600 bg-red-950/50 hover:bg-red-900/50 text-red-600 font-bold uppercase tracking-wider transition-all duration-300 text-glow pulse"
              >
                BEGIN FULL ACCESS →
              </button>
            </div>
          </div>
        </div>
      )}

      {!showHeader && !showNav && (
        <section className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center overflow-hidden">
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-black to-red-950 animate-pulse"></div>
          
          {/* Red flickering warning lights */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-6 h-6 bg-red-600 rounded-full flicker pulse"
              style={{
                top: `${10 + (i % 4) * 25}%`,
                left: `${10 + Math.floor(i / 4) * 80}%`,
                animationDelay: `${i * 0.1}s`,
                boxShadow: '0 0 20px rgba(255,0,0,0.8), 0 0 40px rgba(255,0,0,0.4)',
              }}
            ></div>
          ))}

          {/* Terminal text with typewriter effect */}
          <div className="font-mono text-red-600 space-y-4 text-base md:text-xl relative z-10">
            <div className="glitch text-glow" style={{ animationDelay: '0s' }}>
              <span className="inline-block" style={{ animation: 'typewriter 2s steps(40) forwards' }}>
                ⚠️  CLASSIFIED ARCHIVE: LEVEL OMEGA
              </span>
            </div>
            <div className="glitch text-glow" style={{ animationDelay: '0.1s' }}>
              <span className="inline-block opacity-0 animate-[fadeIn_0.5s_ease-in-out_2s_forwards]" style={{ width: '0', overflow: 'hidden', animation: 'typewriter 2s steps(40) 2s forwards' }}>
                ⚠️  ACCESS BREACH DETECTED
              </span>
            </div>
            <div className="glitch text-glow" style={{ animationDelay: '0.2s' }}>
              <span className="inline-block opacity-0 animate-[fadeIn_0.5s_ease-in-out_4s_forwards]" style={{ width: '0', overflow: 'hidden', animation: 'typewriter 2s steps(40) 4s forwards' }}>
                ⚠️  DISPLAYING REDACTED MATERIAL…
              </span>
            </div>
          </div>

          {/* Big red stamp */}
          <div className="mt-16 text-3xl md:text-7xl font-black uppercase tracking-[0.3em] text-red-600 opacity-0 animate-[fadeIn_2s_ease-in-out_6s_forwards] glitch text-glow relative">
            <div className="absolute inset-0 blur-md opacity-50">THE END FILES — DO NOT OPEN</div>
            <div className="relative">THE END FILES — DO NOT OPEN</div>
          </div>

          {/* Glitch overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-600 animate-[scanline_2s_linear_infinite]"></div>
            <div className="absolute top-1/4 left-0 w-full h-1 bg-red-600 animate-[scanline_2.5s_linear_infinite]"></div>
            <div className="absolute top-1/2 left-0 w-full h-1 bg-red-600 animate-[scanline_3s_linear_infinite]"></div>
            <div className="absolute top-3/4 left-0 w-full h-1 bg-red-600 animate-[scanline_2.2s_linear_infinite]"></div>
          </div>
        </section>
      )}

      {showHeader && (
        <Header
          isHolder={isHolder}
          isVerifying={isVerifying}
          connected={connected}
          onHolderVerified={(holder) => {
            setIsHolder(holder)
            setIsVerifying(false)
          }}
          onVerifyingStart={() => setIsVerifying(true)}
          onConnectedChange={setConnected}
          showMusicControls={true}
        />
      )}

      {/* Section 2 — Government Files */}
      <section id="government-files" className="min-h-screen py-20 px-4 md:px-8 relative z-10 flex items-center justify-center" style={{
        background: '#000000',
      }}>
        <div className="w-full max-w-7xl mx-auto">
          {/* "The Damned" text above files */}
          {currentFileIndex === null && (
            <div className="text-center" style={{ marginTop: '-80px', marginBottom: '60px' }}>
              <h1 
                className="font-mono font-black text-6xl md:text-8xl uppercase tracking-widest"
                style={{
                  color: '#dc2626',
                  letterSpacing: '0.2em',
                }}
              >
                THE DAMNED
              </h1>
            </div>
          )}
            {/* Stacked File Pages - Fanned Out Like Image - MUCH BIGGER */}
            {currentFileIndex === null ? (
              <div className="relative flex justify-center items-center classified-files-container" style={{ minHeight: '700px', paddingTop: '0px' }}>
                {classifiedFiles.map((file, idx) => {
                  // Fan them out from left to right
                  const zIndex = 20 - idx
                  const offsetX = idx * 140 // More spacing for bigger papers
                  const offsetY = idx * 25 // More vertical offset
                  const rotation = idx === 0 ? -10 : idx === 1 ? -5 : 0 // Fan rotation
                  
                  const isHovered = hoveredFileIndex === idx
                  const hoverScale = isHovered ? 1.12 : 1
                  const hoverLift = isHovered ? -25 : 0
                  const hoverRotation = isHovered ? rotation + 2 : rotation
                  
                  return (
                    <div
                      key={file.id}
                      onClick={() => {
                        setCurrentFileIndex(idx)
                        setRevealedWords(new Set())
                      }}
                      onMouseEnter={() => setHoveredFileIndex(idx)}
                      onMouseLeave={() => setHoveredFileIndex(null)}
                      className={`absolute cursor-pointer file-paper-hover classified-file ${isHovered ? 'is-hovered' : ''}`}
                      style={{
                        zIndex: isHovered ? 50 : zIndex,
                        left: `${offsetX}px`,
                        top: `${offsetY}px`,
                        transform: `rotate(${hoverRotation}deg) translateX(${idx * 20}px) translateY(${hoverLift}px) scale(${hoverScale})`,
                        width: '550px',
                        height: '700px',
                        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      }}
                    >
                      {/* Paper document */}
                      <div
                        className="relative w-full h-full file-paper-content"
                        style={{
                          background: '#faf5e6',
                          border: '12px solid #3e2723',
                          borderRadius: '6px',
                          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4), inset 0 0 120px rgba(139, 69, 19, 0.1)',
                          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        }}
                      >
                        {/* Paper texture */}
                        <div className="absolute inset-0 pointer-events-none opacity-30" style={{
                          backgroundImage: `
                            url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E"),
                            repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(139, 69, 19, 0.03) 2px, rgba(139, 69, 19, 0.03) 4px)
                          `,
                        }}></div>

                        {/* CLASSIFIED Stamp - Centered */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                          <div className="classified-stamp" style={{
                            background: '#8B0000',
                            border: '5px solid #660000',
                            padding: '16px 40px',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5), inset 0 2px 0 rgba(255, 255, 255, 0.1)',
                            position: 'relative',
                            marginBottom: '12px',
                            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          }}>
                            <p className="font-mono font-black text-3xl uppercase tracking-widest classified-stamp-text" style={{ 
                              color: '#ffffff',
                              letterSpacing: '0.2em',
                              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.6)',
                            }}>
                              CLASSIFIED
                            </p>
                            {/* Stamp texture/distressed effect */}
                            <div className="absolute inset-0 opacity-20" style={{
                              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 4px)`,
                            }}></div>
                          </div>
                          {/* The Damned text under CLASSIFIED */}
                          <p className="font-mono font-black text-2xl uppercase tracking-widest mt-3 the-damned-text" style={{ 
                            color: '#dc2626',
                            letterSpacing: '0.15em',
                            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                            transition: 'all 0.4s ease',
                          }}>
                            THE DAMNED
                          </p>
                        </div>

                        {/* File ID */}
                        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-center">
                          <p className="font-mono font-bold text-2xl uppercase tracking-wider file-id-text" style={{ color: '#1a1a1a' }}>
                            {file.id}
                          </p>
                          <p className="font-mono text-base mt-2 file-title-text" style={{ color: '#666' }}>
                            {file.title}
                          </p>
                        </div>

                        {/* Shadow for depth */}
                        <div 
                          className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-8 file-shadow"
                          style={{
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '50%',
                            filter: 'blur(15px)',
                            transform: 'translateX(-50%)',
                            transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}

              {/* Show file content only when a file is selected */}
              {currentFileIndex !== null && (
                <>
                  {/* Back button */}
                  <button
                    onClick={() => {
                      setCurrentFileIndex(null)
                      setRevealedWords(new Set())
                    }}
                    className="mb-8 px-6 py-3 bg-red-600 text-white font-mono font-bold uppercase tracking-wider border-4 border-red-800 hover:bg-red-700 transition-colors shadow-lg"
                  >
                    ← BACK TO FILES
                  </button>

                  {/* Header */}
                  <div className="text-center border-b-4 border-gray-700 pb-8 mb-10">
                    <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-wider" style={{
                      color: '#e5e5e5',
                      fontFamily: 'sans-serif',
                      letterSpacing: '0.15em',
                      fontWeight: '700',
                    }}>
                      DEPARTMENT OF OCCULT THREAT ASSESSMENT
                    </h2>
                  </div>
                  
                  {/* File details - BIGGER TEXT */}
                  <div className="space-y-5 font-mono text-xl md:text-2xl" style={{ color: '#e5e5e5' }}>
                    <p><strong style={{ fontSize: '1.1em', color: '#ffffff' }}>FILE:</strong> <span style={{ color: '#e5e5e5', fontSize: '1.1em' }}>{classifiedFiles[currentFileIndex]?.id}</span></p>
                    <p><strong style={{ fontSize: '1.1em', color: '#ffffff' }}>TITLE:</strong> <span style={{ color: '#e5e5e5', fontSize: '1.1em' }}>{classifiedFiles[currentFileIndex]?.title}</span></p>
                    <p><strong style={{ fontSize: '1.1em', color: '#ffffff' }}>STATUS:</strong> <span className="shake" style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '1.3em' }}>{classifiedFiles[currentFileIndex]?.status}</span></p>
                    <p><strong style={{ fontSize: '1.1em', color: '#ffffff' }}>THREAT LEVEL:</strong> <span className="text-glow pulse" style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '1.4em', backgroundColor: '#dc2626', padding: '2px 8px', borderRadius: '4px' }}>{classifiedFiles[currentFileIndex]?.threatLevel}</span></p>
                  </div>

                  {/* Additional Notes */}
                  {classifiedFiles[currentFileIndex]?.additionalNotes && (
                    <div className="bg-red-950/20 border-l-4 border-red-600 p-6 font-mono text-lg mt-6" style={{ color: '#e5e5e5' }}>
                      <p className="font-bold text-red-500 mb-2">CLASSIFIED NOTES:</p>
                      <p style={{ color: '#d1d5db' }}>
                        {classifiedFiles[currentFileIndex]?.additionalNotes.split('red').map((part, idx, arr) => {
                          if (idx === arr.length - 1) return part
                          return (
                            <span key={idx}>
                              {part}
                              <span
                                className="cursor-pointer relative inline-block mx-1"
                                onMouseEnter={() => setShowSecretQuotes(true)}
                                onMouseLeave={() => setShowSecretQuotes(false)}
                                style={{
                                  color: '#dc2626',
                                  fontWeight: 'bold',
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'wavy',
                                  textUnderlineOffset: '4px',
                                  transition: 'all 0.3s ease',
                                }}
                              >
                                red
                              </span>
                            </span>
                          )
                        })}
                      </p>
                    </div>
                  )}
                  
                  {/* Hoverable RED word in journal - visible trigger */}
                  <div className="mt-8 text-center">
                    <p style={{ color: '#e5e5e5' }} className="text-lg font-mono">
                      Journal entry marked in{' '}
                      <span
                        className="cursor-pointer relative inline-block"
                        onMouseEnter={() => setShowSecretQuotes(true)}
                        onMouseLeave={() => setShowSecretQuotes(false)}
                        style={{
                          color: '#dc2626',
                          fontWeight: 'bold',
                          textDecoration: 'underline',
                          textDecorationStyle: 'dashed',
                          textUnderlineOffset: '4px',
                          transition: 'all 0.3s ease',
                          fontSize: '1.2em',
                        }}
                      >
                        RED
                      </span>
                      {' '}— hover to reveal secrets
                    </p>
                  </div>

                  {/* Redacted text - BIGGER TEXT */}
                  <div className="space-y-6 mt-12 text-xl md:text-2xl leading-relaxed" style={{ color: '#e5e5e5', fontFamily: 'serif' }}>
                    {redactedTexts.map((item, idx) => {
                      // Check if text contains "red" and make it hoverable
                      const textParts = item.text.split(/(red|RED)/i)
                      
                      return (
                        <p key={idx} className="relative">
                          {textParts.map((part, partIdx) => {
                            if (part.toLowerCase() === 'red') {
                              return (
                                <span
                                  key={partIdx}
                                  className="cursor-pointer relative inline-block"
                                  onMouseEnter={() => setShowSecretQuotes(true)}
                                  onMouseLeave={() => setShowSecretQuotes(false)}
                                  style={{
                                    color: '#dc2626',
                                    fontWeight: 'bold',
                                    textDecoration: 'underline',
                                    textDecorationStyle: 'dashed',
                                    textUnderlineOffset: '4px',
                                    transition: 'all 0.3s ease',
                                  }}
                                >
                                  {part}
                                </span>
                              )
                            }
                            return <span key={partIdx} style={{ color: '#e5e5e5', fontSize: '1em' }}>{part}</span>
                          })}
                          {item.redacted && (
                            <span
                              className="cursor-pointer inline-block mx-2"
                              onMouseEnter={() => revealWord(item.reveal)}
                              style={{
                                background: revealedWords.has(item.reveal) ? 'transparent' : '#dc2626',
                                color: revealedWords.has(item.reveal) ? '#dc2626' : 'transparent',
                                padding: '0 12px',
                                height: '1.5em',
                                verticalAlign: 'baseline',
                                transition: 'all 0.3s ease',
                                position: 'relative',
                                display: 'inline-block',
                              }}
                            >
                              {revealedWords.has(item.reveal) ? (
                                <span style={{ textDecoration: 'underline', fontWeight: 'bold', fontSize: '1em', color: '#dc2626' }}>{item.reveal}</span>
                              ) : (
                                <span style={{
                                  display: 'inline-block',
                                  width: '180px',
                                  height: '100%',
                                  background: '#dc2626',
                                  position: 'relative',
                                }}>
                                  <span style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'repeating-linear-gradient(90deg, #dc2626 0px, #dc2626 3px, #991b1b 3px, #991b1b 6px)',
                                  }}></span>
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      )
                    })}
                  </div>
                  
                  {/* Secret Quotes Popup */}
                  {showSecretQuotes && (
                    <div 
                      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                      onMouseEnter={() => setShowSecretQuotes(true)}
                      onMouseLeave={() => setShowSecretQuotes(false)}
                      style={{
                        animation: 'fadeIn 0.3s ease-out',
                      }}
                    >
                      <div 
                        className="bg-black border-4 border-red-600 p-8 max-w-3xl mx-4 max-h-[80vh] overflow-y-auto shadow-[0_0_100px_rgba(220,38,38,0.8)]"
                        style={{
                          boxShadow: '0 0 100px rgba(220, 38, 38, 0.8), inset 0 0 50px rgba(220, 38, 38, 0.2)',
                        }}
                      >
                        <h3 className="text-3xl font-black uppercase text-red-600 mb-6 text-center" style={{
                          textShadow: '0 0 20px rgba(220, 38, 38, 0.8)',
                        }}>
                          CLASSIFIED JOURNALS
                        </h3>
                        
                        <div className="space-y-6 text-white font-mono text-lg leading-relaxed">
                          <div className="border-l-4 border-red-600 pl-4">
                            <p className="text-red-400 mb-2">&ldquo;They are not trying to open a door. They are trying to destroy the door itself.&rdquo;</p>
                            <p className="text-gray-400 text-sm">— Dr. ████████, Last message before they vanished</p>
                          </div>
                          
                          <div className="border-l-4 border-red-600 pl-4">
                            <p className="text-red-400 mb-2">&ldquo;This symbol shows up every time: 𝔇 (THE DAMNED). Found carved into ████████, ████████, and ████████. Older than all known people by ████████ years.&rdquo;</p>
                            <p className="text-gray-400 text-sm">— Report ████████</p>
                          </div>
                          
                          <div className="border-l-4 border-red-600 pl-4">
                            <p className="text-red-400 mb-2">&ldquo;If they finish the ritual, reality breaks. Not in a story way. For real. Time stops. Space falls apart. Everything that ever was and ever will be becomes ████████.&rdquo;</p>
                            <p className="text-gray-400 text-sm">— Secret Meeting ████████</p>
                          </div>
                          
                          <div className="border-l-4 border-red-600 pl-4">
                            <p className="text-red-400 mb-2">&ldquo;The ritual needs ████████ sacrifices, each at a ████████ spot. They have done ████████ of ████████. We have ████████ days.&rdquo;</p>
                            <p className="text-gray-400 text-sm">— Report ████████</p>
                          </div>
                          
                          <div className="border-l-4 border-red-600 pl-4">
                            <p className="text-red-400 mb-2">&ldquo;They call themselves The Damned, but they are not damned. They are ████████. They already won. We just have not figured it out yet.&rdquo;</p>
                            <p className="text-gray-400 text-sm">— Last words, Agent ████████&apos;s journal</p>
                          </div>
                        </div>
                        
                        <div className="mt-6 text-center">
                          <p className="text-red-600/50 text-sm">Hover over &ldquo;red&rdquo; in the journal to see these secrets</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
      </section>

      {/* Section 3 — Photos of Sightings */}
      <section id="sightings" className="min-h-screen py-20 px-4 md:px-8 relative z-10 flex items-center justify-center" style={{
        background: 'radial-gradient(ellipse at center, #1a0000 0%, #000000 100%)',
      }}>
        <div className="w-full max-w-7xl mx-auto">
          <h2 className="text-5xl font-black uppercase tracking-wider text-red-600 mb-16 text-center text-glow glitch">
            EVIDENCE BOARD
          </h2>
          
          {/* Bulletin Board Container with Frame */}
          <div className="relative mx-auto" style={{ maxWidth: '1400px' }}>
            {/* Wooden Frame */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to bottom, #8B4513 0%, #654321 50%, #8B4513 100%)',
              borderRadius: '20px',
              padding: '30px',
              boxShadow: 'inset 0 0 50px rgba(0, 0, 0, 0.5), 0 20px 60px rgba(0, 0, 0, 0.8)',
              transform: 'translateY(15px)',
            }}>
              <div className="absolute inset-0" style={{
                background: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(0, 0, 0, 0.1) 10px, rgba(0, 0, 0, 0.1) 11px)',
                borderRadius: '20px',
              }}></div>
            </div>
            
            {/* Cork Board Surface */}
            <div className="relative" style={{
              background: 'linear-gradient(135deg, #D2691E 0%, #CD853F 25%, #DEB887 50%, #CD853F 75%, #D2691E 100%)',
              borderRadius: '10px',
              padding: '60px 40px',
              boxShadow: 'inset 0 0 100px rgba(0, 0, 0, 0.3), 0 10px 40px rgba(0, 0, 0, 0.6)',
              position: 'relative',
              overflow: 'visible',
            }}>
              {/* Cork Texture */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: `
                  url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='cork'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.04' numOctaves='3' /%3E%3CfeColorMatrix values='0.8 0 0 0 0.4 0 0.7 0 0 0.35 0 0 0.6 0 0.3 0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23cork)' opacity='0.6'/%3E%3C/svg%3E"),
                  repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(101, 67, 33, 0.1) 2px, rgba(101, 67, 33, 0.1) 4px),
                  repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(101, 67, 33, 0.1) 2px, rgba(101, 67, 33, 0.1) 4px)
                `,
                borderRadius: '10px',
                opacity: 0.8,
              }}></div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">

          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              className={`relative polaroid-shake ${clickedPhotos.has(idx) ? 'photo-zoom' : ''}`}
              onClick={() => handlePhotoClick(idx)}
              style={{ animationDelay: `${idx * 0.5}s` }}
            >
              <div className="bg-white p-6 transform hover:scale-105 transition-all duration-300 cursor-pointer border-4 border-red-600" style={{
                transform: `rotate(${Math.random() * 8 - 4}deg)`,
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4), 0 4px 10px rgba(0, 0, 0, 0.3), inset 0 0 20px rgba(0, 0, 0, 0.05)',
                position: 'relative',
                zIndex: 10,
              }}>
                <div className={`bg-gradient-to-br from-gray-900 via-red-950 to-black ${photo.image ? '' : 'h-80 flex flex-col items-center justify-center'} text-red-600 font-mono text-xs text-center p-6 border-4 border-red-600 relative`}>
                  {photo.image ? (
                    <>
                      <div className="relative w-full" style={{ position: 'relative' }}>
                        <Image
                          src={photo.image}
                          alt={photo.alt}
                          width={1600}
                          height={1600}
                          className="w-full h-auto"
                          style={{ 
                            filter: 'contrast(1.2) brightness(0.9) sepia(0.2)',
                            display: 'block',
                            objectFit: 'contain',
                            maxWidth: '100%',
                            height: 'auto',
                            width: '100%'
                          }}
                          unoptimized
                        />
                        {/* Photo effect overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-red-600/20 to-transparent animate-pulse pointer-events-none" style={{ mixBlendMode: 'overlay' }}></div>
                        <div className="absolute inset-0 pointer-events-none" style={{
                          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(220, 38, 38, 0.1) 2px, rgba(220, 38, 38, 0.1) 4px)`,
                          mixBlendMode: 'overlay'
                        }}></div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Photo effect overlay */}
                      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-red-600/20 to-transparent animate-pulse"></div>
                      <div className="absolute inset-0" style={{
                        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(220, 38, 38, 0.1) 2px, rgba(220, 38, 38, 0.1) 4px)`,
                      }}></div>
                      
                      <div className="relative z-10 space-y-2">
                        <div className="text-2xl mb-4">👁️</div>
                        <p className="text-lg font-bold uppercase tracking-wider">{photo.description}</p>
                        <p className="text-sm opacity-80">{photo.alt.toUpperCase()}</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-4 text-center space-y-2">
                  <p className="text-xs font-mono text-gray-800 font-bold">
                    SIGHTING CONFIRMED
                  </p>
                  <p className="text-xs font-mono text-red-600">
                    LOCATION: <span className="shake">{photo.location}</span>
                  </p>
                  <p className="text-xs font-mono text-gray-600 mt-2 italic px-2">
                    {photo.lore}
                  </p>
                </div>
                {/* Realistic Thumbtacks - Multiple pins */}
                {/* Top-left pin */}
                <div className="absolute -top-2 -left-2 z-20" style={{ transform: 'rotate(-10deg)' }}>
                  <div className="w-4 h-4 bg-gradient-to-br from-red-500 to-red-700 rounded-full shadow-lg" style={{
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                  }}></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-red-800 rounded-full" style={{
                    clipPath: 'polygon(50% 0%, 30% 30%, 0% 50%, 30% 70%, 50% 100%, 70% 70%, 100% 50%, 70% 30%)',
                    filter: 'blur(1px)',
                    opacity: 0.6,
                  }}></div>
                </div>
                {/* Top-right pin */}
                <div className="absolute -top-2 -right-2 z-20" style={{ transform: 'rotate(10deg)' }}>
                  <div className="w-4 h-4 bg-gradient-to-br from-red-500 to-red-700 rounded-full shadow-lg" style={{
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                  }}></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-red-800 rounded-full" style={{
                    clipPath: 'polygon(50% 0%, 30% 30%, 0% 50%, 30% 70%, 50% 100%, 70% 70%, 100% 50%, 70% 30%)',
                    filter: 'blur(1px)',
                    opacity: 0.6,
                  }}></div>
                </div>
                {/* Shadow under photo from pins */}
                <div className="absolute -top-1 -left-1 w-full h-full bg-black opacity-10 blur-sm" style={{
                  transform: 'translate(3px, 3px)',
                  zIndex: -1,
                }}></div>
              </div>
            </div>
          ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4 — Ritual Blueprints */}
      <section id="blueprints" className="min-h-screen py-20 px-4 md:px-8 relative z-10 bg-black">
        <div className="max-w-6xl mx-auto space-y-12">
          <h2 className="text-5xl font-black uppercase tracking-wider text-red-600 text-center text-glow glitch">
            CLASSIFIED BLUEPRINTS
          </h2>

          <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border-4 border-red-600 p-12 relative overflow-hidden pulse" style={{
            boxShadow: '0 0 50px rgba(220, 38, 38, 0.5), inset 0 0 50px rgba(220, 38, 38, 0.1)',
          }}>
            {/* Animated background pattern */}
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(220, 38, 38, 0.1) 10px, rgba(220, 38, 38, 0.1) 20px)`,
              animation: 'rotate 20s linear infinite',
            }}></div>

            {/* Ritual circle diagram */}
            <div className="relative w-full max-w-4xl mx-auto">
              <div className="relative w-full" style={{ position: 'relative' }}>
                <Image
                  src="/New folder (17)/ad2f7093-a4c6-4e5d-a249-2bc952bc1701.png"
                  alt="Ritual Blueprint"
                  width={1600}
                  height={1600}
                  className="w-full h-auto"
                  style={{ 
                    filter: 'contrast(1.2) brightness(0.9) sepia(0.2)',
                    display: 'block',
                    objectFit: 'contain',
                    maxWidth: '100%',
                    height: 'auto',
                    width: '100%'
                  }}
                  unoptimized
                />
                {/* Photo effect overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-red-600/20 to-transparent animate-pulse pointer-events-none" style={{ mixBlendMode: 'overlay' }}></div>
                <div className="absolute inset-0 pointer-events-none" style={{
                  backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(220, 38, 38, 0.1) 2px, rgba(220, 38, 38, 0.1) 4px)`,
                  mixBlendMode: 'overlay'
                }}></div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-12 space-y-6 text-red-600 font-mono text-base relative z-10">
              <p className="border-l-4 border-red-600 pl-6 py-2 bg-red-950/20 hover:bg-red-950/40 transition-colors">
                <span className="text-red-400">&ldquo;</span>They are not trying to open a door. They are trying to destroy the door itself.<span className="text-red-400">&rdquo;</span>
                <span className="text-xs text-red-600/60 block mt-1">— Dr. ████████, Last message before they vanished</span>
              </p>
              <p className="border-l-4 border-red-600 pl-6 py-2 bg-red-950/20 hover:bg-red-950/40 transition-colors">
                <span className="text-red-400">&ldquo;</span>This symbol shows up every time: <span className="text-2xl text-glow">𝔇</span> (THE DAMNED). Found carved into ████████, ████████, and ████████. Older than all known people by ████████ years.<span className="text-red-400">&rdquo;</span>
                <span className="text-xs text-red-600/60 block mt-1">— Report ████████</span>
              </p>
              <p className="border-l-4 border-red-600 pl-6 py-2 bg-red-950/20 hover:bg-red-950/40 transition-colors shake">
                <span className="text-red-400">&ldquo;</span>If they finish the ritual, reality breaks. Not in a story way. For real. Time stops. Space falls apart. Everything that ever was and ever will be becomes ████████.<span className="text-red-400">&rdquo;</span>
                <span className="text-xs text-red-600/60 block mt-1">— Secret Meeting ████████</span>
              </p>
              <p className="border-l-4 border-red-600 pl-6 py-2 bg-red-950/20 hover:bg-red-950/40 transition-colors">
                <span className="text-red-400">&ldquo;</span>The ritual needs ████████ sacrifices, each at a ████████ spot. They have done ████████ of ████████. We have ████████ days.<span className="text-red-400">&rdquo;</span>
                <span className="text-xs text-red-600/60 block mt-1">— Report ████████</span>
              </p>
              <p className="border-l-4 border-red-600 pl-6 py-2 bg-red-950/20 hover:bg-red-950/40 transition-colors">
                <span className="text-red-400">&ldquo;</span>They call themselves The Damned, but they are not damned. They are ████████. They already won. We just have not figured it out yet.<span className="text-red-400">&rdquo;</span>
                <span className="text-xs text-red-600/60 block mt-1">— Last words, Agent ████████&apos;s journal</span>
              </p>
            </div>

            {/* Projected result */}
            <div className="mt-16 text-center border-4 border-red-600 p-8 bg-gradient-to-br from-red-950 via-black to-red-950 relative overflow-hidden">
              <div className="absolute inset-0 bg-red-600 opacity-10 animate-pulse"></div>
              <p className="text-2xl font-black uppercase text-red-600 relative z-10 mb-4 text-glow">
                PROJECTED RESULT OF COMPLETION:
              </p>
              <p className="text-4xl font-black uppercase text-red-600 relative z-10 glitch text-glow" style={{ animationDuration: '1s' }}>
                &ldquo;THE END OF EVERYTHING&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5 — Corrupted Documents */}
      <section id="corrupted" className="min-h-screen py-20 px-4 md:px-8 relative z-10" style={{
        background: 'linear-gradient(to bottom, #000000 0%, #1a0000 50%, #000000 100%)',
      }}>
        <div className="max-w-5xl mx-auto space-y-8">
          <h2 className="text-5xl font-black uppercase tracking-wider text-red-600 text-center text-glow glitch">
            CORRUPTED ARCHIVES
          </h2>

          <div className="bg-gray-900 border-4 border-red-600 p-10 relative overflow-hidden corrupt" style={{
            boxShadow: '0 0 30px rgba(220, 38, 38, 0.3)',
          }}>
            {/* Corrupted overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(220, 38, 38, 0.05) 2px, rgba(220, 38, 38, 0.05) 4px)`,
            }}></div>

            <div className="font-mono text-red-600 space-y-6 text-base relative z-10">
              <p className="shake">Subject ██████ showed █████████████ powers including ████████, ████████, and ████████.</p>
              <p>Lock down plan: <span className="text-red-600 font-bold text-xl shake pulse">FAILED</span>.</p>
              <p className="glitch">Result: ██ DEAD ██. Everyone sent to ████████ reported ████████ within 72 hours.</p>
              <p>Subject ██████ was last seen ████████. Camera footage shows ████████. Sound recordings have ████████.</p>
              <p className="shake">Warning: Do not try to ████████. Last time we tried it ended with ████████.</p>
              <p className="glitch">File broken by ████████. Last change: ████████. Status: ████████.</p>
            </div>

            {/* Corrupted text scrolling */}
            <div className="mt-10 font-mono text-xs text-red-600/30 overflow-hidden h-40 relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black pointer-events-none z-10"></div>
              <div style={{ 
                animation: 'scroll 15s linear infinite',
                transform: 'translateY(0)',
              }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="whitespace-nowrap glitch" style={{ animationDelay: `${i * 0.1}s` }}>
                    {Array.from({ length: 120 }).map(() => String.fromCharCode(Math.floor(Math.random() * 94) + 33)).join('')}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-12 text-center">
              <div className="inline-block bg-red-950 border-4 border-red-600 p-8 shake pulse" style={{
                boxShadow: '0 0 40px rgba(220, 38, 38, 0.6)',
              }}>
                <p className="text-3xl font-black text-red-600 font-mono text-glow glitch">
                  ERROR 666: FILE CORRUPTED BY UNKNOWN ENTITY
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6 — Blood-Smudged Warnings */}
      <section id="warnings" className="min-h-screen py-20 px-4 md:px-8 relative overflow-hidden bg-black">
        {/* Blood drops */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="blood-drop"
            style={{
              left: `${10 + i * 15}%`,
              animationDelay: `${i * 0.5}s`,
            }}
          ></div>
        ))}

        <div className="max-w-5xl mx-auto space-y-12 relative z-10">
          <h2 className="text-5xl font-black uppercase tracking-wider text-red-600 text-center text-glow glitch">
            FINAL WARNINGS
          </h2>

          <div className="space-y-10">
            {[
              { text: "YOU CAN'T STOP THEM.", author: "They've been here longer than you think." },
              { text: "THE DAMNED ARE ALREADY HERE.", author: "They're not coming. They've always been here." },
              { text: "IF YOU'RE READING THIS… RUN.", author: "Don't look back. Don't trust your reflection." },
              { text: "THIS IS THE END.", author: "Not the end of the world. The end of everything." },
              { text: "THE RITUAL WAS NEVER MEANT FOR MORTALS.", author: "It was meant to unmake us all." },
              { text: "THEY SPEAK IN VOICES THAT DON'T EXIST.", author: "And we're starting to understand them." },
              { text: "REALITY IS FRACTURING.", author: "Can't you feel it? The cracks are everywhere." },
            ].map((warning, idx) => (
              <div
                key={idx}
                className="bg-gray-900 border-4 border-red-600 p-8 relative transform hover:scale-105 transition-transform duration-300"
                style={{
                  transform: `rotate(${Math.random() * 6 - 3}deg)`,
                  boxShadow: '0 0 30px rgba(220, 38, 38, 0.4)',
                }}
              >
                {/* Blood smudges */}
                <div className="absolute top-4 right-4 w-24 h-24 bg-red-900 rounded-full opacity-50 blur-xl animate-pulse"></div>
                <div className="absolute bottom-4 left-4 w-20 h-20 bg-red-900 rounded-full opacity-40 blur-lg animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute top-1/2 right-1/4 w-16 h-16 bg-red-800 rounded-full opacity-30 blur-md"></div>
                
                {/* Handwriting effect */}
                <div className="relative z-10">
                  <p
                    className={`text-red-600 font-bold ${
                      idx === 3 ? 'text-5xl text-center text-glow shake' : 'text-2xl'
                    }`}
                    style={{
                      textShadow: '3px 3px 6px rgba(0,0,0,0.9), 0 0 20px rgba(220, 38, 38, 0.5)',
                      fontFamily: 'cursive',
                      filter: 'drop-shadow(2px 2px 4px rgba(139, 0, 0, 0.8))',
                    }}
                  >
                    {warning.text}
                  </p>
                  <p className="text-red-600/60 text-sm mt-2 italic" style={{ fontFamily: 'cursive' }}>
                    {warning.author}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Whisper audio hint */}
        <audio ref={audioRef} loop className="hidden">
          <source src="/music/slash.mp3" type="audio/mpeg" />
        </audio>
      </section>

      {/* Jump Scare Audio */}
      <audio ref={jumpScareAudioRef} preload="auto" className="hidden">
        <source src="/music/jumpscare.mp3" type="audio/mpeg" />
      </audio>

      {/* FINAL SECTION — The Redacted Ending */}
      <section id="ending" className="min-h-screen bg-black flex flex-col items-center justify-center px-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-radial from-red-950 via-black to-black animate-pulse"></div>
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(220, 38, 38, 0.03) 2px, rgba(220, 38, 38, 0.03) 4px)`,
        }}></div>

        {!showEndFile ? (
          <div className="text-center space-y-8 relative z-10">
            <div
              className="font-mono text-red-600 text-3xl cursor-pointer hover:text-red-400 transition-all duration-300 glitch text-glow pulse transform hover:scale-110"
              onClick={handleJumpScare}
              style={{
                textShadow: '0 0 20px rgba(220, 38, 38, 0.8), 0 0 40px rgba(220, 38, 38, 0.4)',
              }}
            >
              END_FILE_OMEGA.TXT
            </div>
            <p className="text-red-600/50 text-sm animate-pulse">Click to open</p>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 border-4 border-red-600/20 rounded-full animate-ping"></div>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-12 animate-[fadeIn_1s_ease-in-out] relative z-10">
            <p className="text-red-600/90 text-3xl md:text-5xl font-mono text-glow mb-12">
              THE END WILL NEVER BE HERE
            </p>
            
            <p className="text-red-600/90 text-2xl md:text-4xl font-mono text-glow mb-8">
              DAMNED BETS COMING SOON
            </p>

            <Link
              href="https://damnedbets.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-12 py-6 bg-red-600 text-white font-bold uppercase tracking-wider hover:bg-red-700 transition-all duration-300 border-4 border-red-800 pulse text-xl transform hover:scale-110"
              style={{
                boxShadow: '0 0 30px rgba(220, 38, 38, 0.6), inset 0 0 20px rgba(0, 0, 0, 0.3)',
              }}
            >
              VISIT DAMNEDBETS.COM →
            </Link>

            {/* Roulette Wheel */}
            <div className="mt-16 w-full max-w-2xl mx-auto">
              <RouletteWheel />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
