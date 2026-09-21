export type NovelRole = 'user' | 'assistant';

export type NovelMessage = {
  id: string;
  role: NovelRole;
  content: string;
  isSetup?: boolean;
};

export type Novel = {
  id: string;
  title: string;
  subtext?: string;
  coverImageUri?: string;
  setting: string;
  plot: string;
  messages: NovelMessage[];
  createdAt: string;
  updatedAt: string;
};
