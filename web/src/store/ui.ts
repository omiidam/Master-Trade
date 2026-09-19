/**
 * UI state (Zustand).
 *
 * Local interface state only: which page is open, writing direction, density and
 * which dialog is showing. No domain data lives here — conversations, progress
 * and market data will come from the backend through the typed API layer, and
 * the frontend never calls a provider, the database or the LLM directly
 * (docs/technology-decisions.md § 1.2).
 */

import { create } from 'zustand';
import type { AppPageId } from '../config/navigation';

export type Direction = 'ltr' | 'rtl';
export type Density = 'comfortable' | 'compact';

export interface UiState {
  page: AppPageId;
  direction: Direction;
  density: Density;
  sidebarCollapsed: boolean;
  safetyDialogOpen: boolean;
  aboutDialogOpen: boolean;
  setPage: (page: AppPageId) => void;
  setDirection: (direction: Direction) => void;
  toggleDirection: () => void;
  setDensity: (density: Density) => void;
  toggleSidebar: () => void;
  setSafetyDialogOpen: (open: boolean) => void;
  setAboutDialogOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  page: 'dashboard',
  direction: 'ltr',
  density: 'comfortable',
  sidebarCollapsed: false,
  safetyDialogOpen: false,
  aboutDialogOpen: false,
  setPage: (page) => set({ page }),
  setDirection: (direction) => set({ direction }),
  toggleDirection: () => set((state) => ({ direction: state.direction === 'ltr' ? 'rtl' : 'ltr' })),
  setDensity: (density) => set({ density }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSafetyDialogOpen: (safetyDialogOpen) => set({ safetyDialogOpen }),
  setAboutDialogOpen: (aboutDialogOpen) => set({ aboutDialogOpen }),
}));
