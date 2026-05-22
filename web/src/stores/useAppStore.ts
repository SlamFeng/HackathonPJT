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
};

type AppState = {
  avatar: AvatarState;
  closet: ClosetItem[];
  setAvatar: (avatar: AvatarState) => void;
  upsertClosetItem: (item: ClosetItem) => void;
  toggleFavorite: (id: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  avatar: {},
  closet: [],
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
}));
