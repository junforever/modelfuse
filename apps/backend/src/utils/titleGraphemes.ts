export const TITLE_MAX_GRAPHEMES = 80;

const titleSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function countTitleGraphemes(value: string): number {
  let count = 0;

  for (const _segment of titleSegmenter.segment(value)) {
    count += 1;
  }

  return count;
}

export function truncateTitleGraphemes(value: string, maximum = TITLE_MAX_GRAPHEMES): string {
  if (maximum <= 0) {
    return '';
  }

  let count = 0;

  for (const segment of titleSegmenter.segment(value)) {
    if (count === maximum) {
      return value.slice(0, segment.index);
    }

    count += 1;
  }

  return value;
}
