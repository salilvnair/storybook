/** Style presets for the AI Art Director + One-Tap Restyle (S19). */
export interface StylePreset {
  id: string;
  label: string;
  accent: string;
  description: string;
  prompt: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'cartoon',
    label: 'Cartoon',
    accent: '#f59e0b',
    description: 'Bright flat cartoon with bold outlines',
    prompt: "bright flat cartoon illustration for a young children's picture book, thick black outlines, bold pastel colours, big expressive eyes, cute characters, simple clean background",
  },
  {
    id: 'watercolour',
    label: 'Watercolour',
    accent: '#38bdf8',
    description: 'Dreamy watercolour washes',
    prompt: "soft watercolour painting, dreamy pastel washes, delicate brushwork, gentle textures, warm cozy mood, children's book illustration, white paper texture showing through",
  },
  {
    id: 'pixel',
    label: 'Pixel Art',
    accent: '#a78bfa',
    description: 'Retro 16-bit pixel style',
    prompt: "cute pixel art illustration, 16-bit retro style, vibrant bold colours, charming pixel characters, simple pixel backgrounds, game-book aesthetic",
  },
  {
    id: 'anime',
    label: 'Studio Ghibli',
    accent: '#ec4899',
    description: 'Ghibli-inspired soft anime',
    prompt: "Studio Ghibli inspired anime illustration, soft cell shading, expressive emotive characters, lush nature backgrounds, warm golden light, painterly quality",
  },
  {
    id: 'claymation',
    label: 'Claymation',
    accent: '#34d399',
    description: 'Clay 3D character style',
    prompt: "claymation style 3D illustration, cute clay characters with visible texture, bright solid colours, Aardman Animations aesthetic, cheerful tactile feel",
  },
  {
    id: 'pencil',
    label: 'Pencil Sketch',
    accent: '#94a3b8',
    description: 'Classic hand-drawn pencil',
    prompt: "charming pencil sketch illustration, hand-drawn style, warm sepia tones, loose expressive lines, hatching details, vintage storybook feel, slightly rough paper texture",
  },
  {
    id: 'oilpaint',
    label: 'Oil Painting',
    accent: '#f97316',
    description: 'Rich impressionist oil',
    prompt: "rich oil painting, impressionist style, thick impasto brushstrokes, warm golden earth tones, painterly children's book illustration, museum-quality finish",
  },
  {
    id: 'storybook',
    label: 'Classic Storybook',
    accent: '#8b5cf6',
    description: 'Fairytale ink + watercolour',
    prompt: "classic children's book illustration, detailed ink line drawings with watercolour washes, reminiscent of Beatrix Potter and classic fairytale books, warm nostalgic cosy colours",
  },
  {
    id: 'crayon',
    label: 'Crayon',
    accent: '#22d3ee',
    description: 'Bright waxy crayon drawing',
    prompt: "crayon drawing style, bright waxy colours with visible crayon texture, childlike charm, simple bold shapes, thick crayon outlines, cheerful energetic feel",
  },
  {
    id: 'cutepaper',
    label: 'Paper Cutout',
    accent: '#fb923c',
    description: 'Layered paper collage',
    prompt: "paper cutout collage illustration, layered paper shapes, bold flat colours, slight drop shadows between layers, Eric Carle inspired, tactile handmade feel",
  },
];
