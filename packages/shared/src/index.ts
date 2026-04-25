// Auth DTOs
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

/** /auth/login response when the user has 2FA enabled. */
export interface TotpRequiredResponse {
  requiresTotp: true;
  twoFactorToken: string;
}

export type LoginResponse = AuthResponse | TotpRequiredResponse;

export interface TotpVerifyRequest {
  twoFactorToken: string;
  code: string;
}

export interface TotpEnrollStartResponse {
  secret: string;
  otpAuthUrl: string;
  qrDataUrl: string;
}

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  totpEnabled?: boolean;
}

// Room DTOs
export interface CreateRoomRequest {
  name: string;
}

export interface RoomDTO {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string; // ISO 8601
  isOwner: boolean;
  lastJoined: string | null; // ISO 8601 or null if never joined
}

export interface RoomListResponse {
  owned: RoomDTO[];
  recent: RoomDTO[];
}

// Token DTOs
export interface LiveKitTokenResponse {
  token: string;
  url: string; // wss://livekit-host
  roomId: string;
}

// Chat DTOs
export type ChatThreadType = "room" | "dm";

export interface ChatMessageDTO {
  id: string;
  threadType: ChatThreadType;
  threadId: string;
  authorId: string;
  authorName: string;
  /** null when soft-deleted */
  body: string | null;
  createdAt: string; // ISO 8601
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ChatHistoryResponse {
  messages: ChatMessageDTO[];
}

export interface ChatSendRequest {
  threadType: ChatThreadType;
  threadId: string;
  body: string;
}

export interface ChatSendResponse {
  message: ChatMessageDTO;
}

export interface DmThreadEntry {
  threadId: string;
  lastMessage: ChatMessageDTO;
}

export interface DmThreadsResponse {
  threads: DmThreadEntry[];
}

/** Server → client WebSocket events. */
export type ChatWsEvent =
  | { type: "ready"; userId: string }
  | { type: "message"; message: ChatMessageDTO }
  | { type: "edited"; message: ChatMessageDTO }
  | { type: "deleted"; id: string; threadType: ChatThreadType; threadId: string }
  | { type: "pong" }
  | { type: "error"; code: string; threadId?: string };

/** Client → server WebSocket frames. */
export type ChatWsCommand =
  | { type: "subscribe"; threadType: ChatThreadType; threadId: string }
  | { type: "unsubscribe"; threadType: ChatThreadType; threadId: string }
  | { type: "ping" };

// Error shape returned on any non-2xx
export interface ErrorResponse {
  error: {
    code: string;     // e.g. "VALIDATION_ERROR"
    message: string;  // human readable
  };
}
