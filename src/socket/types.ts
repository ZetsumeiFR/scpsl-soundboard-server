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
  username: string;
  sounds: SoundInfo[];
}

export interface AuthErrorResponse {
  type: "auth_error";
  error: string;
}

export interface SoundsListResponse {
  type: "sounds_list";
  sounds: SoundInfo[];
}

export interface SoundDataResponse {
  type: "sound_data";
  soundId: string;
  name: string;
  duration: number;
  audioBase64: string;
}

export interface SoundErrorResponse {
  type: "sound_error";
  soundId: string;
  error: string;
}

export interface SoundsUpdatedNotification {
  type: "sounds_updated";
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
  authenticated: boolean;
  userId?: string;
  steamId64?: string;
  username?: string;
}
