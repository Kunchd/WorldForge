export function normalizeOpenAIApiKey(apiKey: string): string {
  return apiKey.replace(/[\s\u0000-\u001f\u007f]/g, '');
}
