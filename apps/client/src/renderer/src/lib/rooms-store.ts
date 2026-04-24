import { createStore, type StoreApi } from "zustand/vanilla";
import type { RoomDTO } from "@redvoice/shared";
import { ApiClient, ApiError } from "./api.js";

export interface RoomsState {
  owned: RoomDTO[];
  recent: RoomDTO[];
  activeRoomId: string | null; // set when user chooses to join; Plan 3 consumes it
  status: "idle" | "loading" | "ready";
  error: string | null;

  refresh(): Promise<void>;
  create(name: string): Promise<RoomDTO>;
  join(idOrUrl: string): Promise<void>;
  clearActive(): void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractRoomId(input: string): string | null {
  const trimmed = input.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/join\/([0-9a-f-]{36})/i);
    if (match && match[1]) return match[1];
  } catch {
    // Not a URL
  }
  return null;
}

export function createRoomsStore(api: ApiClient): StoreApi<RoomsState> {
  return createStore<RoomsState>((set, get) => ({
    owned: [],
    recent: [],
    activeRoomId: null,
    status: "idle",
    error: null,

    async refresh() {
      set({ status: "loading", error: null });
      try {
        const { owned, recent } = await api.listRooms();
        set({ owned, recent, status: "ready" });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "failed to load rooms";
        set({ status: "ready", error: message });
      }
    },

    async create(name) {
      const room = await api.createRoom({ name });
      const { owned } = get();
      set({ owned: [room, ...owned] });
      return room;
    },

    async join(idOrUrl) {
      const id = extractRoomId(idOrUrl);
      if (!id) {
        set({ error: "That doesn't look like a room link or id." });
        return;
      }
      try {
        const room = await api.getRoom(id);
        set({ activeRoomId: room.id, error: null });
      } catch (err) {
        const message =
          err instanceof ApiError && err.code === "NOT_FOUND"
            ? "Room not found."
            : err instanceof ApiError
              ? err.message
              : "failed to open room";
        set({ error: message });
      }
    },

    clearActive() {
      set({ activeRoomId: null });
    },
  }));
}
