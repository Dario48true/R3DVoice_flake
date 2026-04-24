import type {
  AuthResponse,
  CreateRoomRequest,
  LoginRequest,
  RegisterRequest,
  RoomDTO,
  RoomListResponse,
  UserDTO,
  LiveKitTokenResponse,
  ErrorResponse,
} from "@redvoice/shared";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private async request<TBody, TRes>(
    method: "GET" | "POST",
    path: string,
    body?: TBody,
  ): Promise<TRes> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;

    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers,
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (err) {
      throw new ApiError("NETWORK", err instanceof Error ? err.message : "network error", 0);
    }

    if (response.status === 204) {
      return undefined as TRes;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const payload: unknown = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      if (isJson && payload && typeof payload === "object" && "error" in payload) {
        const err = (payload as ErrorResponse).error;
        throw new ApiError(err.code, err.message, response.status);
      }
      throw new ApiError("HTTP_ERROR", `request failed with ${response.status}`, response.status);
    }

    return payload as TRes;
  }

  // Auth
  register(body: RegisterRequest): Promise<AuthResponse> {
    return this.request("POST", "/auth/register", body);
  }
  login(body: LoginRequest): Promise<AuthResponse> {
    return this.request("POST", "/auth/login", body);
  }
  logout(): Promise<void> {
    return this.request("POST", "/auth/logout");
  }
  me(): Promise<UserDTO> {
    return this.request("GET", "/me");
  }

  // Rooms
  listRooms(): Promise<RoomListResponse> {
    return this.request("GET", "/rooms");
  }
  getRoom(id: string): Promise<RoomDTO> {
    return this.request("GET", `/rooms/${encodeURIComponent(id)}`);
  }
  createRoom(body: CreateRoomRequest): Promise<RoomDTO> {
    return this.request("POST", "/rooms", body);
  }
  mintLiveKitToken(roomId: string): Promise<LiveKitTokenResponse> {
    return this.request("POST", `/rooms/${encodeURIComponent(roomId)}/token`);
  }
}
