import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ConfigState {
  mainColor: string;
  accentColor: string;
  cushionColor: string;
  selectedModel: string;
  lightIntensity: number;
  partColors: Record<string, string>;
  partTextures: Record<string, string>;
  selectedDecal: string;
  ambientSpin: boolean;
}

export const baseConfig: ConfigState = {
  mainColor: "#f5f5f7",
  accentColor: "#121212",
  cushionColor: "#7e1919",
  selectedModel: "shirt",
  lightIntensity: 2.0,
  partColors: {},
  partTextures: {},
  selectedDecal: "luxi",
  ambientSpin: true,
};

interface ConfigStore {
  config: ConfigState;
  setConfig: (config: ConfigState) => void;
  updateConfig: (partial: Partial<ConfigState>) => void;
  updatePartColors: (colors: Record<string, string>) => void;
  updatePartTextures: (textures: Record<string, string>) => void;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      config: baseConfig,
      setConfig: (config) => set({ config }),
      updateConfig: (partial) => set((state) => ({ config: { ...state.config, ...partial } })),
      updatePartColors: (colors) => set((state) => ({ 
        config: { ...state.config, partColors: { ...state.config.partColors, ...colors } } 
      })),
      updatePartTextures: (textures) => set((state) => ({ 
        config: { ...state.config, partTextures: { ...state.config.partTextures, ...textures } } 
      })),
    }),
    {
      name: 'luxi-config-storage',
    }
  )
);
