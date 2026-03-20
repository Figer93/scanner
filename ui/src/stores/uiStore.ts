/**
 * Zustand store for global UI state.
 * Covers sidebar open/close, active modals, and user preferences
 * that must survive across page navigation within the SPA.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModalId = 'lead-profile' | 'company-detail' | 'template-editor' | 'run-pipeline' | null;

interface UIState {
    // Sidebar
    sidebarOpen: boolean;
    // Modals — only one open at a time
    activeModal: ModalId;
    activeModalData: Record<string, unknown>;
    // User preferences (persisted to localStorage)
    theme: 'dark';
    tablePageSize: number;
    kanbanCompact: boolean;
}

interface UIActions {
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
    openModal: (id: ModalId, data?: Record<string, unknown>) => void;
    closeModal: () => void;
    setTablePageSize: (size: number) => void;
    setKanbanCompact: (compact: boolean) => void;
}

const DEFAULT_UI_STATE: UIState = {
    sidebarOpen: true,
    activeModal: null,
    activeModalData: {},
    theme: 'dark',
    tablePageSize: 50,
    kanbanCompact: false,
};

export const useUIStore = create<UIState & UIActions>()(
    persist(
        (set) => ({
            ...DEFAULT_UI_STATE,

            setSidebarOpen: (open) => set({ sidebarOpen: open }),
            toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

            openModal: (id, data = {}) => set({ activeModal: id, activeModalData: data }),
            closeModal: () => set({ activeModal: null, activeModalData: {} }),

            setTablePageSize: (size) => set({ tablePageSize: size }),
            setKanbanCompact: (compact) => set({ kanbanCompact: compact }),
        }),
        {
            name: 'foundlystart-ui',
            // Only persist user preferences, not ephemeral UI state
            partialize: (state) => ({
                sidebarOpen: state.sidebarOpen,
                tablePageSize: state.tablePageSize,
                kanbanCompact: state.kanbanCompact,
            }),
        }
    )
);
