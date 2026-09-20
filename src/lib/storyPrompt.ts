import storyPrompt from '../../prompt.md';

type StoryBrief = {
  setting: string;
  plot: string;
};

const STORY_SECTION_MARKER = '<User story>';

export function buildStoryPrompt({ setting, plot }: StoryBrief): string {
  const userStory = [
    STORY_SECTION_MARKER,
    '',
    'Setting:',
    setting.trim(),
    '',
    'High-level plot and desired progression:',
    plot.trim(),
  ].join('\n');

  if (!storyPrompt.includes(STORY_SECTION_MARKER)) {
    return `${storyPrompt.trim()}\n\n${userStory}`;
  }

  return storyPrompt.replace(STORY_SECTION_MARKER, userStory).trim();
}
