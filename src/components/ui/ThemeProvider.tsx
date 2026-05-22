"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ theme: Theme }>({
    theme: "dark",
  });

  useEffect(() => {
    const savedTheme = (localStorage.getItem("theme") as Theme) || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    
    // Defer state update to avoid synchronous cascading render warning
    const timer = setTimeout(() => {
      setState({ theme: savedTheme });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const newTheme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    setState((prev) => ({ ...prev, theme: newTheme }));
  };

  const { theme } = state;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
