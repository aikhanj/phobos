export const env = {
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ?? '',
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
};

export function hasApiKey(): boolean {
  return env.ELEVENLABS_API_KEY.length > 0;
}
