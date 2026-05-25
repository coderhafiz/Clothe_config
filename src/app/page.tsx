"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
const ConfiguratorCanvas = dynamic(() => import("@/components/configurator/ConfiguratorCanvas"), { ssr: false });
import ControlPanel from "@/components/configurator/ControlPanel";
import LandingOverlay from "@/components/ui/LandingOverlay";
import Loader from "@/components/ui/Loader";

import { useTheme } from "@/components/ui/ThemeProvider";
import { MODELS } from "@/components/configurator/Model";

import { useSafari } from "@/hooks/useSafari";
import { useConfigStore } from "@/store/useConfigStore";

export default function Home() {
  const { theme } = useTheme();
  const isSafari = useSafari();

  // Initialize state directly from URL to avoid cascading renders
  const [showConfigurator, setShowConfigurator] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("config");
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640
  );
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [shouldEagerLoad, setShouldEagerLoad] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check for Safari or iOS to prevent heavy background WebGL initialization
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!(isSafari || isIOS)) {
      // Use a timeout to avoid React "cascading render" warnings and hydration mismatches
      const timer = setTimeout(() => setShouldEagerLoad(true), 50);
      return () => clearTimeout(timer);
    }

    const check = () =>
      setIsMobileLandscape(
        window.innerWidth > window.innerHeight && window.innerHeight < 700
      );
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const config = useConfigStore((state) => state.config);


  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentConfig = useConfigStore.getState().config;
      const params = new URLSearchParams(window.location.search);
      const sharedConfig = params.get("config");
      if (sharedConfig) {
        try {
          const decoded = JSON.parse(atob(sharedConfig));
          useConfigStore.getState().setConfig({ ...currentConfig, ...decoded });
          // Clean the URL so reloads use the persisted state instead of the shared URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
          console.error("Failed to parse shared config", e);
        }
      } else {
        // Pre-fill default colors for the initial model if they are empty
        const initialModel = MODELS.find((m) => m.id === currentConfig.selectedModel) || MODELS[0];
        let hasChanges = false;
        const newColors = { ...currentConfig.partColors };
        
        initialModel.parts.forEach((part) => {
          if (!newColors[part.id]) {
            newColors[part.id] = currentConfig.mainColor;
            hasChanges = true;
          }
        });

        if (hasChanges) {
          useConfigStore.getState().updatePartColors(newColors);
        }
      }
    }
  }, []);

  const selectedModelInfo = useMemo(() => {
    return MODELS.find((m) => m.id === config.selectedModel) || MODELS[0];
  }, [config.selectedModel]);



  const handleShare = async () => {
    const configString = btoa(
      JSON.stringify({
        selectedModel: config.selectedModel,
        partColors: config.partColors,
        partTextures: config.partTextures,
        selectedDecal: config.selectedDecal,
        ambientSpin: config.ambientSpin,
      })
    );

    const url = `${window.location.origin}${window.location.pathname}?config=${configString}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "My LUXI WEAR 3D Streetwear Design",
          text: `Check out this custom ${selectedModelInfo.name} I configured!`,
          url: url,
        });
      } catch (e) {
        console.log("Share cancelled or failed", e);
      }
    } else {
      await navigator.clipboard.writeText(url);
      alert("Design link copied to clipboard!");
    }
  };

  return (
    <main className="relative w-full h-dvh overflow-hidden bg-bg-dark selection:bg-brand-primary/30 flex flex-col">
      <AnimatePresence>
        {!showConfigurator && (
          <motion.div
            key="landing"
            initial={{ y: 0 }}
            exit={{ y: "-100dvh" }}
            transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
            className="absolute inset-0 z-100"
            style={isSafari ? { willChange: "transform" } : undefined}
          >
            <LandingOverlay onEnter={() => setShowConfigurator(true)} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          scale: showConfigurator ? 1 : 0.95,
          opacity: showConfigurator ? 1 : 0.3,
          y: showConfigurator ? 0 : 40,
          filter: showConfigurator ? "blur(0px)" : "blur(10px)",
        }}
        transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        className="relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        {/* Ambient background glows */}
        <div className="fixed top-0 left-0 w-full h-dvh pointer-events-none flex items-center justify-center overflow-hidden">
          {isSafari ? (
            <>
              <div
                className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full opacity-25 dark:opacity-15"
                style={{ background: "radial-gradient(circle, var(--brand-primary) 0%, transparent 70%)" }}
              />
              <div
                className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-20 dark:opacity-10"
                style={{ background: "radial-gradient(circle, var(--brand-secondary) 0%, transparent 70%)" }}
              />
              <div
                className="absolute w-[70%] h-[70%] rounded-full opacity-20 dark:opacity-30 transition-colors duration-1000"
                style={{ background: `radial-gradient(circle, ${config.mainColor} 0%, transparent 70%)` }}
              />
            </>
          ) : (
            <>
              <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/25 dark:bg-brand-primary/15 blur-[140px] rounded-full" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-secondary/20 dark:bg-brand-secondary/10 blur-[140px] rounded-full" />

              <div
                className="absolute w-[70%] h-[70%] rounded-full blur-[180px] opacity-20 dark:opacity-30 transition-colors duration-1000"
                style={{ backgroundColor: config.mainColor }}
              />
            </>
          )}

          <motion.h1
            key={selectedModelInfo.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: isLoaded
                ? (isMobileLandscape || (!isCollapsed && typeof window !== "undefined" && window.innerWidth < 640)
                  ? 0
                  : (theme === "dark" ? 0.08 : 0.12))
                : 0,
              scale: 1,
            }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="text-[30vw] lg:text-[20vw] font-black tracking-tighter text-black dark:text-white select-none pointer-events-none uppercase whitespace-nowrap"
          >
            {selectedModelInfo.name.split(" ").slice(-1)[0]}
          </motion.h1>
        </div>

        <header className="hidden sm:flex absolute top-0 left-0 p-4 lg:p-8 items-center z-50 pointer-events-none bg-transparent border-none landscape-optimized-header">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="pointer-events-auto"
          >
            <h1 className="text-xl lg:text-2xl font-black tracking-tighter flex items-center gap-2">
              <span className="bg-black text-white px-2 py-0.5 rounded flex items-center">LUXI</span> <span className="text-brand-primary">WEAR</span>
            </h1>
          </motion.div>
        </header>

        <div className="relative w-full h-full flex-1 min-h-0">
          <AnimatePresence>
            {!isLoaded && showConfigurator && (
              <Loader progress={isLoaded ? 100 : 45} />
            )}
          </AnimatePresence>

          <div className="absolute inset-0 z-0">
            {(showConfigurator || shouldEagerLoad) && (
              <ConfiguratorCanvas
                config={config}
                onLoaded={() => setIsLoaded(true)}
                isInitialLoading={!isLoaded}
              />
            )}
          </div>

          {isLoaded && showConfigurator && (
            <ControlPanel
              isCollapsed={isCollapsed}
              setIsCollapsed={setIsCollapsed}
              onShare={handleShare}
            />
          )}
        </div>

        {isLoaded && showConfigurator && (
          <div className="fixed bottom-6 left-[50%] -translate-x-[50%] flex flex-col items-center gap-2 pointer-events-none z-30 landscape-optimized-selection-hint">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 }}
              className="lg:scale-100 origin-bottom landscape-optimized-interaction-hint"
            >
              <div className="px-3 py-1.5 glass rounded-full flex items-center gap-2 whitespace-nowrap shadow-xl border border-(--glass-border)">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                <p className="lg:text-[10px] text-[8px] font-bold uppercase tracking-[0.2em]">
                  Drag anywhere to rotate
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2 }}
              className="text-text-muted lg:text-[11px] text-[9px] uppercase font-bold tracking-[0.2em] flex items-center gap-4"
            >
              Select options to customize your streetwear
            </motion.div>
          </div>
        )}

        {/* Signature - Desktop Only */}
        <div
          className={`hidden lg:flex absolute bottom-8 right-8 z-100 items-center gap-1.5 pointer-events-none select-none transition-all duration-300 ${isMobileLandscape ? "opacity-30 scale-[0.4] origin-bottom-right" : "opacity-80"
            }`}
          style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
        >
          <span className="text-[10px] font-medium tracking-wide text-white/40">
            by
          </span>
          <div className="flex items-center">
            <span className="text-[11px] font-bold text-white/90">Web Dev</span>
            <span
              className="text-[11px] font-bold ml-1"
              style={{ color: "#d4b682" }}
            >
              Graphically©
            </span>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
