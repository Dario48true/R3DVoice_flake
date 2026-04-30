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
  handle?: string | null;
  totpEnabled?: boolean;
}

// Room DTOs
export interface CreateRoomRequest {
  name: string;
  isPublic?: boolean;
}

export interface UpdateRoomRequest {
  name?: string;
  isPublic?: boolean;
}

export interface InviteMemberRequest {
  userId: string;
}

export interface TransferOwnershipRequest {
  newOwnerId: string;
}

export interface RoomDTO {
  id: string;
  name: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: string; // ISO 8601
  isOwner: boolean;
  lastJoined: string | null; // ISO 8601 or null if never joined
}

export interface RoomMemberDTO {
  userId: string;
  displayName: string;
  isOwner: boolean;
  joinedAt: string; // ISO 8601
  lastJoined: string; // ISO 8601
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

// Friends DTOs
export type FriendStatus = "pending-incoming" | "pending-outgoing" | "accepted" | "blocked";

export interface FriendDTO {
  friendshipId: string;
  status: FriendStatus;
  user: { id: string; displayName: string; email: string };
  isOnline: boolean;
  requestedAt: string;
  respondedAt: string | null;
}

export interface FriendsListResponse {
  friends: FriendDTO[];
}

export interface FriendRequestRequest {
  email: string;
}

export interface FriendRequestResponse {
  friendshipId: string;
  status: "pending-outgoing";
  user: { id: string; displayName: string; email: string };
}

// Error shape returned on any non-2xx
export interface ErrorResponse {
  error: {
    code: string;     // e.g. "VALIDATION_ERROR"
    message: string;  // human readable
  };
}

// Invite DTOs and validation schemas
import { z } from "zod";

export const userHandleSchema = z
  .string()
  .min(3, "handle must be at least 3 characters")
  .max(24, "handle must be at most 24 characters")
  .regex(/^[a-z0-9_]+$/, "handle may only contain lowercase letters, digits, and underscores");

export type UserHandle = z.infer<typeof userHandleSchema>;

export const inviteKindSchema = z.enum(["room", "friend"]);
export type InviteKind = z.infer<typeof inviteKindSchema>;

export const createInviteSchema = z
  .object({
    kind: inviteKindSchema,
    targetRoomId: z.string().uuid().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (v: any) => (v.kind === "room") === (v.targetRoomId !== undefined),
    { message: "targetRoomId required for kind='room' and forbidden for kind='friend'" },
  );

export interface InviteDTO {
  id: string;
  code: string;
  kind: InviteKind;
  creatorId: string;
  targetRoomId: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface InvitePublicMetadataDTO {
  code: string;
  kind: InviteKind;
  creator: { handle: string; displayName: string };
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  revokedAt: string | null;
}

export interface InviteFullMetadataDTO extends InvitePublicMetadataDTO {
  targetRoom?: { id: string; name: string; memberCount: number };
}

export interface InviteRedeemResultDTO {
  kind: InviteKind;
  redirectTo: string; // e.g. "/rooms/<id>" or "/dms"
}
