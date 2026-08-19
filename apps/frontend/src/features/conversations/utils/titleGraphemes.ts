const titleSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function countTitleGraphemes(title: string): number {
  return [...titleSegmenter.segment(title)].length;
}
