"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { useSafari } from "@/hooks/useSafari";

interface LandingOverlayProps {
  onEnter: () => void;
}

export default function LandingOverlay({ onEnter }: LandingOverlayProps) {
  const isSafari = useSafari();

  return (
    <div className="absolute inset-0 w-full h-full z-100 bg-bg-dark text-text-main overflow-hidden transition-colors duration-500">
      {/* 1. FIXED ELEMENTS SHELL (Always visible, non-scrolling) */}
      <div className="absolute inset-0 z-50 pointer-events-none">
        {/* Theme Toggle */}
        <div className="absolute top-4 right-4 sm:top-8 sm:right-8 pointer-events-auto">
          <ThemeToggle />
        </div>

        {/* Signature */}
        <div 
          className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 flex items-center gap-1.5 opacity-80 pointer-events-auto"
          style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
        >
          <span className="text-[10px] font-medium tracking-wide text-white/40">by</span>
          <div className="flex items-center">
            <span className="text-[11px] font-bold text-white/90">Web Dev</span>
            <span className="text-[11px] font-bold ml-1" style={{ color: '#d4b682' }}>Graphically©</span>
          </div>
        </div>

        {/* Background Ambience (Fixed behind everything) */}
        {isSafari ? (
          <>
            <div 
              className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full pointer-events-none -z-10 opacity-20"
              style={{ background: "radial-gradient(circle, var(--brand-primary) 0%, transparent 70%)" }}
            />
            <div 
              className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full pointer-events-none -z-10 opacity-10"
              style={{ background: "radial-gradient(circle, #c4a484 0%, transparent 70%)" }}
            />
          </>
        ) : (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-brand-primary/20 blur-[140px] rounded-full pointer-events-none -z-10" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[#c4a484]/10 blur-[120px] rounded-full pointer-events-none -z-10" />
          </>
        )}
      </div>

      {/* 2. SCROLLABLE CONTENT AREA */}
      <div className="relative w-full h-full overflow-y-auto custom-scrollbar z-10">
        <div className="min-h-full w-full flex flex-col items-center py-16 sm:py-20 px-4 landscape-optimized-landing-container">
          
          {/* Main Content Block - Using my-auto for smart vertical centering */}
          <motion.div
            className="my-auto flex flex-col items-center text-center px-4 sm:px-8 max-w-4xl landscape-optimized-landing-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="mb-6 sm:mb-8"
            >
              <h1 className="text-4xl sm:text-7xl font-black tracking-tighter landscape-optimized-landing-title flex items-center justify-center gap-2 sm:gap-4">
                <span className="bg-black text-white px-3 sm:px-5 py-1 sm:py-2 rounded-xl flex items-center">LUXI</span> <span className="text-brand-primary">WEAR</span>
              </h1>
              <p className="text-xs sm:text-sm font-bold text-text-muted uppercase tracking-[0.4em] mt-2 landscape-optimized-landing-subtitle">
                Signature Streetwear
              </p>
            </motion.div>

            <h2 className="text-2xl sm:text-5xl font-bold mb-6 sm:mb-8 leading-tight tracking-tight landscape-optimized-landing-hero">
              Define Your Style <br className="hidden sm:block" />
              in 3D.
            </h2>

            <p className="text-sm sm:text-lg text-text-muted mb-10 sm:mb-14 max-w-2xl leading-relaxed landscape-optimized-landing-desc">
              Experience premium custom apparel in stunning 3D. Customize textures,
              colors, and graphic prints in real-time to design your perfect outfit.
            </p>

            <button
              onClick={onEnter}
              className={`group relative w-full sm:w-auto flex justify-center px-6 py-4 sm:px-10 sm:py-5 glass rounded-full items-center gap-3 sm:gap-4 border-2 border-(--glass-border) hover:border-brand-primary/50 duration-500 overflow-hidden landscape-optimized-landing-btn ${
                isSafari ? "transition-colors" : "transition-all"
              }`}
            >
              {/* Button Background Glow */}
              <div className="absolute inset-0 bg-brand-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <span className="relative z-10 text-[10px] sm:text-base font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em]">
                Configure Your Masterpiece
              </span>
              <ArrowRight className="relative z-10 w-4 h-4 sm:w-5 sm:h-5 text-brand-primary group-hover:translate-x-1 transition-transform duration-300" />
            </button>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
