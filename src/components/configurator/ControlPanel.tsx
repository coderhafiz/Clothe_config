"use client";

import { MODELS } from "./Model";
import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  startTransition,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Sliders, Share2, ShoppingBag } from "lucide-react";
import { useTheme } from "../ui/ThemeProvider";
import ThemeToggle from "../ui/ThemeToggle";

// ─── Curated contemporary streetwear palette ───────────────────────────────────
const PALETTE = [
  { name: "Onyx Black", hex: "#121212" },
  { name: "Off-White", hex: "#f5f5f7" },
  { name: "Royal Crimson", hex: "#7e1919" },
  { name: "Sage Green", hex: "#5f6f61" },
  { name: "Cobalt Blue", hex: "#1d4ed8" },
  { name: "Terracotta", hex: "#b45309" },
  { name: "Mustard Gold", hex: "#ca8a04" },
];

const TEXTURE_OPTIONS = {
  "Solid Fabric": "none",
  "Rough Linen": "linen",
  "Luxe Velvet": "velvet",
  "Street Leather": "leather",
};

const DECAL_OPTIONS = {
  "Clean Solid": "none",
  "LUXI Logo": "luxi",
  "Streetwear Print": "graphic",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Collapsible section matching folder look */
function Folder({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-1.5 text-left group"
      >
        <ChevronDown
          className={`w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform shrink-0 text-text-muted ${open ? "" : "-rotate-90"}`}
        />
        <span
          className="text-[8px] sm:text-xs font-bold uppercase tracking-widest text-text-main"
        >
          {title}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="ml-2.5 sm:ml-5 pl-2 sm:pl-3 border-l-2"
              style={{
                borderColor: isDark
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(0,0,0,0.15)",
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Label + range slider row */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const display = step < 1 ? value.toFixed(2) : Math.round(value).toString();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-2 sm:px-5 py-1 sm:py-2 landscape-optimized-row">
      <div className="flex justify-between items-center sm:block sm:w-32 shrink-0">
        <span className="text-[9px] sm:text-sm font-semibold text-text-main truncate">
          {label}
        </span>
        <span className="text-[8px] sm:hidden tabular-nums text-text-muted">
          {display}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 flex-1 w-full sm:w-auto min-w-0">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1 accent-[#c4a484] cursor-pointer"
        />
        <span className="hidden sm:block text-xs sm:text-sm w-12 text-right tabular-nums text-text-main">
          {display}
        </span>
      </div>
    </div>
  );
}

/** Label + select row */
function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-2 sm:px-5 py-1 sm:py-2 landscape-optimized-row">
      <span className="text-[9px] sm:text-sm font-semibold text-text-main truncate sm:w-32 shrink-0">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:flex-1 text-[9px] sm:text-sm rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 border border-glass-border outline-none cursor-pointer bg-bg-dark text-text-main"
      >
        {Object.entries(options).map(([name, val]) => (
          <option key={val} value={val}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Label + toggle row */
function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-2 px-2 sm:px-5 py-1 sm:py-2 landscape-optimized-row">
      <span className="text-[9px] sm:text-sm font-semibold text-text-main truncate sm:w-32 shrink-0">
        {label}
      </span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-7 h-4 sm:w-9 sm:h-5 rounded-full transition-colors border ${
          value
            ? "bg-[#c4a484] border-[#c4a484]"
            : theme === "dark"
              ? "bg-white/20 border-white/10"
              : "bg-black/10 border-black/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-3 sm:translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}

import { useConfigStore } from "@/store/useConfigStore";

interface ControlPanelProps {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  onShare: () => void;
}

export default function ControlPanel({
  isCollapsed,
  setIsCollapsed,
  onShare,
}: ControlPanelProps) {
  const config = useConfigStore((state) => state.config);
  const updateConfig = useConfigStore((state) => state.updateConfig);
  const updatePartColors = useConfigStore((state) => state.updatePartColors);
  const updatePartTextures = useConfigStore((state) => state.updatePartTextures);

  const selectedModelInfo = useMemo(
    () => MODELS.find((m) => m.id === config.selectedModel) || MODELS[0],
    [config.selectedModel],
  );

  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const check = () =>
      setIsLandscape(window.innerWidth > 640 && window.innerHeight < 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Group parts that share the same display name so one swatch controls all of them.
  const partGroups = useMemo(() => {
    const groups: Map<string, string[]> = new Map();
    selectedModelInfo.parts.forEach((part) => {
      const label = part.name;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(part.id);
    });
    return Array.from(groups.entries());
  }, [selectedModelInfo.parts]);

  /** Set the same colour on every part ID in a group. */
  const setGroupColor = useCallback(
    (ids: string[], hex: string) => {
      const colorsToUpdate: Record<string, string> = {};
      ids.forEach((id) => {
        colorsToUpdate[id] = hex;
      });
      updatePartColors(colorsToUpdate);
    },
    [updatePartColors],
  );

  /** Colour to show for a group: uses first part's stored colour, or default. */
  const groupColor = (ids: string[]) =>
    config.partColors[ids[0]] || PALETTE[0].hex;

  const innerContent = (
    <div
      className="mx-0 sm:mx-2 rounded-2xl py-1.5 sm:py-2 bg-inner-panel-bg border border-inner-panel-border"
    >
      {/* ── View & Lighting ── */}
      <Folder
        key={`View-${isLandscape}`}
        title="Camera & Studio"
        defaultOpen={!isLandscape}
      >
        <SliderRow
          label="Studio Light"
          value={config.lightIntensity}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => updateConfig({ lightIntensity: v as number })}
        />
        <ToggleRow
          label="Ambient Spin"
          value={config.ambientSpin}
          onChange={(v) => updateConfig({ ambientSpin: v as boolean })}
        />
      </Folder>

      {/* ── Fabric Textures ── */}
      <Folder
        key={`Materials-${isLandscape}`}
        title="Fabric Finish"
        defaultOpen={!isLandscape}
      >
        <div className="flex items-center justify-between gap-1 sm:gap-2 px-2 sm:px-5 py-1 sm:py-2 landscape-optimized-row border-b border-white/5 mb-1">
          <span className="text-[9px] sm:text-sm font-semibold text-text-main truncate">
            Base Model Type
          </span>
          <span className="text-[9px] sm:text-sm font-medium text-text-muted">
            {selectedModelInfo.materialType}
          </span>
        </div>
        {partGroups.map(([label, ids]) => (
          <SelectRow
            key={`tex-${label}`}
            label={label}
            value={config.partTextures[ids[0]] || "none"}
            options={TEXTURE_OPTIONS}
            onChange={(v) =>
              startTransition(() => {
                const texturesToUpdate: Record<string, string> = {};
                ids.forEach((id) => {
                  texturesToUpdate[id] = v as string;
                });
                updatePartTextures(texturesToUpdate);
              })
            }
          />
        ))}
        </Folder>

      {/* ── Decals (T-Shirt Only) ── */}
      {config.selectedModel === "shirt" && (
        <Folder
          key={`Decals-${isLandscape}`}
          title="Decals & Prints"
          defaultOpen={true}
        >
          <SelectRow
            label="Graphic Decal"
            value={config.selectedDecal}
            options={DECAL_OPTIONS}
            onChange={(v) => startTransition(() => updateConfig({ selectedDecal: v as string }))}
          />
        </Folder>
      )}

      {/* ── Colour swatches per Blender part ── */}
      <Folder
        key={`Colours-${isLandscape}`}
        title="Colour Configurator"
        defaultOpen={true}
      >
        <div className="px-2 sm:px-3 pb-2">
          {partGroups.map(([label, ids]) => {
            const current = groupColor(ids);
            return (
              <div
                key={label}
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-1.5 sm:px-1 py-1 sm:py-2 rounded-xl hover:bg-white/5 transition-colors landscape-optimized-row"
              >
                {/* Part label */}
                <span className="text-[9px] sm:text-sm font-semibold text-text-main capitalize sm:w-28 shrink-0">
                  {label}
                </span>

                {/* Swatches */}
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                  {PALETTE.map((color) => {
                    const isActive = current === color.hex;
                    return (
                      <button
                        key={color.hex}
                        title={color.name}
                        onClick={() => setGroupColor(ids, color.hex)}
                        className="relative w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full transition-transform hover:scale-110 focus:outline-none shrink-0 border border-white/20"
                        style={{ backgroundColor: color.hex }}
                      >
                        {isActive && (
                          <span className="absolute inset-0 rounded-full ring-2 ring-offset-1 ring-[#c4a484] ring-offset-transparent" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          
            {/* Legend */}
          <div className="flex flex-wrap gap-x-1.5 sm:gap-x-2 gap-y-0.5 sm:gap-y-1 px-1.5 sm:px-4 pt-2 sm:pt-3 landscape-optimized-legend">
            {PALETTE.map((c) => (
              <span
                key={c.hex}
                className="flex items-center gap-0.5 sm:gap-1 text-[7px] sm:text-xs text-text-muted"
              >
                <span
                  className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </Folder>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {isCollapsed && (
          <motion.button
            key="config-trigger"
            initial={{ opacity: 0, x: 20, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.8 }}
            onClick={() => setIsCollapsed(false)}
            className="fixed right-4 top-4 sm:top-auto sm:bottom-6 z-40 p-4 bg-black text-brand-primary border border-glass-border rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-transform cursor-pointer"
          >
            <Sliders className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div
        initial={false}
        animate={{ x: isCollapsed ? "100%" : "0%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 w-1/2 sm:w-[420px] h-screen z-50 select-none desktop-dark-panel bg-black border-l border-glass-border flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div
          className="p-2 sm:p-6 pb-1.5 sm:pb-4 border-b border-glass-border sm:mb-2 flex flex-col cursor-pointer group"
          onClick={() => setIsCollapsed(true)}
        >
          {/* Top row with buttons and close chevron */}
          <div className="flex justify-between items-center w-full mb-2 sm:mb-4">
          {/* Action buttons — always in sidebar */}
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              className="p-1 sm:p-2 glass rounded-full glass-hover relative cursor-pointer"
            >
              <Share2 className="w-3 h-3 sm:w-4 sm:h-4 text-brand-primary" />
            </button>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1 sm:p-2 glass rounded-full glass-hover relative cursor-pointer"
            >
              <ShoppingBag className="w-3 h-3 sm:w-4 sm:h-4 text-brand-primary" />
              <span className="absolute top-0 right-0 w-1 h-1 sm:w-1.5 sm:h-1.5 bg-brand-secondary rounded-full border border-bg-dark" />
            </button>
          </div>
          
          <div className="hidden sm:block" />
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(true);
              }}
              className="p-1 sm:p-1.5 rounded-full bg-(--glass-bg) hover:bg-(--brand-primary)/10 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-brand-primary" />
            </button>
          </div>

          <div>
            <h2 className="text-sm sm:text-2xl font-bold tracking-tight group-hover:text-brand-primary transition-colors">
              Configure Apparel
            </h2>
            <p className="text-[7px] sm:text-xs text-text-muted uppercase tracking-widest font-bold mt-0.5 sm:mt-2">
              LUXI WEAR Studio
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          className="overflow-hidden overflow-y-auto custom-scrollbar px-1.5 sm:px-4 py-2 sm:py-6 space-y-2 sm:space-y-8 flex-1 min-h-0"
          style={{ overflowX: "hidden" }}
        >
          {innerContent}
        </div>
      </motion.div>
    </>
  );
}
