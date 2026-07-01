/**
 * Family insights store — S52.
 * Tracks reading streaks, theme/character engagement, SEL progress,
 * and suggests next stories based on what each child engages with.
 */
import { create } from 'zustand';
import { all, run, kvSet } from '../db/sqldb';

export interface ReadingSession {
  id: string;
  storyId: string;
  storyTitle: string;
  profileId: string;
  startedAt: string;
  completedAt?: string;
  pagesRead: number;
  totalPages: number;
  quizScore?: number;
  vocabWords?: string[];
  selSkills?: string[];
}

export interface InsightSummary {
  profileId: string;
  streak: number;
  lastReadDate: string;
  topThemes: string[];
  topCharacters: string[];
  avgQuizScore: number;
  selProgress: Record<string, number>;
  totalStoriesRead: number;
  totalPagesRead: number;
  suggestions: string[];
}

interface FamilyInsightsState {
  sessions: ReadingSession[];
  summaries: Record<string, InsightSummary>;
  loaded: boolean;
  load: () => Promise<void>;
  recordSession: (session: Omit<ReadingSession, 'id'>) => Promise<void>;
  completeSession: (id: string, data: { pagesRead?: number; quizScore?: number; vocabWords?: string[]; selSkills?: string[] }) => Promise<void>;
  getSummary: (profileId: string) => Promise<InsightSummary>;
  getSuggestions: (profileId: string) => Promise<string[]>;
}

function uid() { return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export const useFamilyInsightsStore = create<FamilyInsightsState>((set, get) => ({
  sessions: [],
  summaries: {},
  loaded: false,

  load: async () => {
    try {
      await run(`CREATE TABLE IF NOT EXISTS reading_sessions (
        id TEXT PRIMARY KEY, story_id TEXT NOT NULL, story_title TEXT NOT NULL,
        profile_id TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT,
        pages_read INTEGER NOT NULL DEFAULT 0, total_pages INTEGER NOT NULL DEFAULT 0,
        quiz_score REAL, vocab_words_json TEXT, sel_skills_json TEXT
      )`, []);
    } catch { /* exists */ }

    const rows = await all<{
      id: string; story_id: string; story_title: string; profile_id: string;
      started_at: string; completed_at: string | null;
      pages_read: number; total_pages: number;
      quiz_score: number | null; vocab_words_json: string | null; sel_skills_json: string | null;
    }>('SELECT * FROM reading_sessions ORDER BY started_at DESC LIMIT 500');

    const sessions: ReadingSession[] = rows.map((r) => ({
      id: r.id, storyId: r.story_id, storyTitle: r.story_title,
      profileId: r.profile_id, startedAt: r.started_at,
      completedAt: r.completed_at ?? undefined,
      pagesRead: r.pages_read, totalPages: r.total_pages,
      quizScore: r.quiz_score ?? undefined,
      vocabWords: JSON.parse(r.vocab_words_json || '[]'),
      selSkills: JSON.parse(r.sel_skills_json || '[]'),
    }));

    set({ sessions, loaded: true });
  },

  recordSession: async (session) => {
    const id = uid();
    await run(
      'INSERT INTO reading_sessions (id, story_id, story_title, profile_id, started_at, pages_read, total_pages) VALUES (?,?,?,?,?,?,?)',
      [id, session.storyId, session.storyTitle, session.profileId, session.startedAt, session.pagesRead, session.totalPages],
    );
    await get().load();
  },

  completeSession: async (id, data) => {
    await run(
      'UPDATE reading_sessions SET completed_at=?, pages_read=?, quiz_score=?, vocab_words_json=?, sel_skills_json=? WHERE id=?',
      [new Date().toISOString(), data.pagesRead ?? 0, data.quizScore ?? null,
       JSON.stringify(data.vocabWords || []), JSON.stringify(data.selSkills || []), id],
    );
    await get().load();
  },

  getSummary: async (profileId) => {
    const sessions = get().sessions.filter((s) => s.profileId === profileId && s.completedAt);
    const totalStoriesRead = sessions.length;
    const totalPagesRead = sessions.reduce((a, s) => a + s.pagesRead, 0);

    // Streak: consecutive days
    const completedDates = [...new Set(sessions.map((s) => s.completedAt!.split('T')[0]))].sort().reverse();
    let streak = 0;
    let checkDate = new Date();
    for (const d of completedDates) {
      const diff = Math.round((checkDate.getTime() - new Date(d).getTime()) / 86400000);
      if (diff <= 1) { streak++; checkDate = new Date(d); } else break;
    }

    // SEL progress: count mentions of each skill
    const selProgress: Record<string, number> = {};
    for (const s of sessions) {
      for (const skill of (s.selSkills || [])) {
        selProgress[skill] = (selProgress[skill] || 0) + 1;
      }
    }

    // Quiz score average
    const quizSessions = sessions.filter((s) => s.quizScore !== undefined);
    const avgQuizScore = quizSessions.length ? quizSessions.reduce((a, s) => a + (s.quizScore || 0), 0) / quizSessions.length : 0;

    // Suggestions based on top skills / interests
    const topSelSkills = Object.entries(selProgress).sort(([, a], [, b]) => b - a).slice(0, 3).map(([k]) => k);
    const suggestions = topSelSkills.length
      ? [`Stories about ${topSelSkills[0]}`, `More adventures with familiar characters`, `A story at the next reading level`]
      : [`Try a branching adventure story`, `Explore a different art style`, `Read a story about animals`];

    const summary: InsightSummary = {
      profileId, streak, lastReadDate: completedDates[0] || '',
      topThemes: [], topCharacters: [], avgQuizScore,
      selProgress, totalStoriesRead, totalPagesRead, suggestions,
    };

    set((s) => ({ summaries: { ...s.summaries, [profileId]: summary } }));
    await kvSet(`insights.${profileId}`, JSON.stringify({ streak, totalStoriesRead, avgQuizScore }));
    return summary;
  },

  getSuggestions: async (profileId) => {
    const summary = await get().getSummary(profileId);
    return summary.suggestions;
  },
}));
