"use client";

import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-1 sm:p-3 glass rounded-full glass-hover relative overflow-hidden group"
      aria-label="Toggle Theme"
    >
      <motion.div
        initial={false}
        animate={{
          y: theme === "dark" ? 0 : 40,
          opacity: theme === "dark" ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-center"
      >
        <Moon className="w-3 h-3 sm:w-5 sm:h-5 text-brand-primary" />
      </motion.div>
      
      <motion.div
        initial={false}
        animate={{
          y: theme === "light" ? -20 : 20,
          opacity: theme === "light" ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <Sun className="w-3 h-3 sm:w-5 sm:h-5 text-brand-primary" />
      </motion.div>
    </button>
  );
}
