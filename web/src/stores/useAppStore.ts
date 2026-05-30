import { create } from "zustand";

export type ClosetCategory =
  | "top"
  | "pants"
  | "skirt"
  | "outerwear"
  | "accessory"
  | "dress"
  | "suit"
  | "underwear"
  | "shoes";

export type ClosetItem = {
  id: string;
  category: ClosetCategory;
  imageUrl: string;
  favorited: boolean;
};

type AvatarState = {
  avatarImageUrl?: string;
  refFaceUrl?: string;
  bodyAnalysis?: {
    height_estimate: string;
    body_shape: string;
    shoulder_width: string;
    waist_definition: string;
    style_suggestion: string;
  } | null;
};

type ScriptItem = {
  id: string;
  session_id: string;
  body_type_summary: string;
  category: string;
  content: string;
  favorite: boolean;
  created_at_ms: number;
};

type AppState = {
  avatar: AvatarState;
  closet: ClosetItem[];
  sessionId: string;
  savedScripts: ScriptItem[];
  setAvatar: (avatar: AvatarState) => void;
  upsertClosetItem: (item: ClosetItem) => void;
  toggleFavorite: (id: string) => void;
  setBodyAnalysis: (analysis: AvatarState["bodyAnalysis"]) => void;
  setSavedScripts: (scripts: ScriptItem[]) => void;
  addSavedScript: (script: ScriptItem) => void;
  updateScriptFavorite: (id: string, favorite: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  avatar: {},
  closet: [],
  sessionId: `session_${Date.now()}`,
  savedScripts: [],
  setAvatar: (avatar) => set({ avatar }),
  upsertClosetItem: (item) =>
    set((s) => {
      const idx = s.closet.findIndex((x) => x.id === item.id);
      if (idx === -1) return { closet: [item, ...s.closet] };
      const next = s.closet.slice();
      next[idx] = item;
      return { closet: next };
    }),
  toggleFavorite: (id) =>
    set((s) => ({
      closet: s.closet.map((x) => (x.id === id ? { ...x, favorited: !x.favorited } : x)),
    })),
  setBodyAnalysis: (analysis) =>
    set((s) => ({ avatar: { ...s.avatar, bodyAnalysis: analysis } })),
  setSavedScripts: (scripts) => set({ savedScripts: scripts }),
  addSavedScript: (script) =>
    set((s) => ({ savedScripts: [script, ...s.savedScripts] })),
  updateScriptFavorite: (id, favorite) =>
    set((s) => ({
      savedScripts: s.savedScripts.map((x) =>
        x.id === id ? { ...x, favorite } : x
      ),
    })),
}));
