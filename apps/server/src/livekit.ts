import { AccessToken } from "livekit-server-sdk";
import { getConfig } from "./config.js";

export interface MintArgs {
  userId: string;
  displayName: string;
  roomId: string;
}

export async function mintLiveKitToken(args: MintArgs): Promise<string> {
  const cfg = getConfig();
  const at = new AccessToken(cfg.LIVEKIT_API_KEY, cfg.LIVEKIT_API_SECRET, {
    identity: args.userId,
    name: args.displayName,
    ttl: 60 * 60, // 1 hour
  });
  at.addGrant({
    room: args.roomId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}
