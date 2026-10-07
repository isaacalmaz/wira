import { extendTailwindMerge } from 'tailwind-merge';

// Our own radius/shadow tokens, so a page's `rounded-sheet` replaces a
// component's `rounded-card` instead of both landing on the element.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['card', 'control', 'sheet', 'tile', 'chip'] }],
      shadow: [{ shadow: ['card', 'sheet', 'pop', 'soft'] }],
    },
  },
});

// Join class names, skipping falsy values; when two classes set the same
// property (e.g. a component's `mb-5` and a page's `mb-0`), the later wins.
export const cx = (...parts) => merge(parts.filter(Boolean).join(' '));
