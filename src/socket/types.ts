// Plugin → Server messages
export interface PluginAuthMessage {
  type: "auth";
  steamId64: string;
  serverKey?: string;
}

export interface PluginGetSoundsMessage {
  type: "get_sounds";
}

export interface PluginPlaySoundMessage {
  type: "play_sound";
  soundId: string;
}

export type PluginMessage =
  | PluginAuthMessage
  | PluginGetSoundsMessage
  | PluginPlaySoundMessage;

// Server → Plugin messages
export interface SoundInfo {
  id: string;
  name: string;
  duration: number;
}

export interface AuthSuccessResponse {
  type: "auth_success";
  steamId64: string;
  username: string;
  sounds: SoundInfo[];
}

export interface AuthErrorResponse {
  type: "auth_error";
  steamId64: string;
  error: string;
}

export interface SoundsListResponse {
  type: "sounds_list";
  steamId64: string;
  sounds: SoundInfo[];
}

export interface SoundDataResponse {
  type: "sound_data";
  steamId64: string;
  soundId: string;
  name: string;
  duration: number;
  audioBase64: string;
}

export interface SoundErrorResponse {
  type: "sound_error";
  steamId64: string;
  soundId: string;
  error: string;
}

export interface SoundsUpdatedNotification {
  type: "sounds_updated";
  steamId64: string;
  sounds: SoundInfo[];
}

export type ServerMessage =
  | AuthSuccessResponse
  | AuthErrorResponse
  | SoundsListResponse
  | SoundDataResponse
  | SoundErrorResponse
  | SoundsUpdatedNotification;

// Socket data stored per connection
export interface PluginSocketData {
  // Map of steamId64 → { userId, username } for all authenticated players on this socket
  authenticatedPlayers: Map<string, { userId: string; username: string }>;
}