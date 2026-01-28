export interface SoundDTO {
  id: string;
  name: string;
  filename: string;
  duration: number;
  size: number;
  createdAt: Date;
}

export interface CreateSoundInput {
  name: string;
  file: Express.Multer.File;
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
  duration?: number;
}
