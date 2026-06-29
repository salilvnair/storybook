/** S23 — Learning Layer: quiz, vocabulary cards, SEL skill. */
import { create } from 'zustand';

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;   // 0-based index into options
}

export interface LearningPack {
  questions: QuizQuestion[];
  selSkill: string;
  selDescription: string;
  parentPrompts: string[];
}

export interface VocabCard {
  word: string;
  definition: string;
  imagePrompt: string;
  loading?: boolean;
}

interface LearningState {
  pack: LearningPack | null;
  packLoading: boolean;
  packError: string | null;

  vocab: Record<string, VocabCard>;   // word → card
  phonicsMode: boolean;

  quizAnswers: Record<number, number>; // questionIdx → chosen option
  quizRevealed: boolean;

  loadPack: (story: object) => Promise<void>;
  lookupVocab: (word: string, context: string) => Promise<void>;
  setPhonicsMode: (on: boolean) => void;
  answerQuestion: (idx: number, optionIdx: number) => void;
  revealQuiz: () => void;
  resetQuiz: () => void;
  reset: () => void;
}

export const useLearningStore = create<LearningState>((set, get) => ({
  pack: null,
  packLoading: false,
  packError: null,
  vocab: {},
  phonicsMode: false,
  quizAnswers: {},
  quizRevealed: false,

  loadPack: async (story) => {
    set({ packLoading: true, packError: null, pack: null, quizAnswers: {}, quizRevealed: false });
    try {
      const res = await fetch('/api/storybook/quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as LearningPack & { ok: boolean };
      set({ pack: { questions: data.questions, selSkill: data.selSkill, selDescription: data.selDescription, parentPrompts: data.parentPrompts }, packLoading: false });
    } catch (err) {
      set({ packError: String(err), packLoading: false });
    }
  },

  lookupVocab: async (word, context) => {
    const existing = get().vocab[word.toLowerCase()];
    if (existing && !existing.loading) return;
    set((s) => ({ vocab: { ...s.vocab, [word.toLowerCase()]: { word, definition: '', imagePrompt: '', loading: true } } }));
    try {
      const res = await fetch('/api/storybook/vocab', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, context }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as VocabCard & { ok: boolean };
      set((s) => ({ vocab: { ...s.vocab, [word.toLowerCase()]: { word: data.word, definition: data.definition, imagePrompt: data.imagePrompt, loading: false } } }));
    } catch {
      set((s) => ({ vocab: { ...s.vocab, [word.toLowerCase()]: { word, definition: 'Could not load definition.', imagePrompt: '', loading: false } } }));
    }
  },

  setPhonicsMode: (on) => set({ phonicsMode: on }),

  answerQuestion: (idx, optionIdx) =>
    set((s) => ({ quizAnswers: { ...s.quizAnswers, [idx]: optionIdx } })),

  revealQuiz: () => set({ quizRevealed: true }),

  resetQuiz: () => set({ quizAnswers: {}, quizRevealed: false }),

  reset: () => set({ pack: null, packLoading: false, packError: null, vocab: {}, quizAnswers: {}, quizRevealed: false }),
}));
