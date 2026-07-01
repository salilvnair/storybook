/**
 * LiveBookFlip — the LIVE animated book shown in StorybookCanvas during and after
 * generation. Data comes directly from the story-store (in-memory b64), not the
 * saved-story API that BookFlip uses.
 *
 * During generation: auto-advances to the latest arrived page spread.
 * After done: full interactive drag-to-turn (same 3D technique as BookFlip).
 *
 * Spreads: 0 = cover art only (right page), no left page
 *          k = scene k text (left) + scene k illustration (right)
 *        N+1 = "The End" back-cover
 *
 * Narration (S16.03 / S16.04 / S17):
 *   - Multi-segment: narration / says / thinks narrated separately with per-character voices
 *   - Word-by-word karaoke highlight via ontimeupdate
 *   - Auto-advance to next page when all segments finish
 *   - Per-segment download button
 */
import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { ModalView, ButtonView, SelectInputView, TextInputView } from '@salilvnair/dui';
import { FlipBook, FlipPage, interiorDensity, type FlipBookHandle } from './FlipBook';
import { PlusIcon } from '../../icons';
import { usePrefsStore } from '../../store/prefs-store';
import { useStoryStore } from '../../store/story-store';
import { useCharactersStore } from '../../store/characters-store';
import { useVoicesStore } from '../../store/voices-store';
import { usePromptsStore } from '../../store/prompts-store';
import { useMusicEngineStore } from '../../store/music-engine-store';
import { useAudioEngineStore } from '../../store/audio-engine-store';
import { useLearningStore } from '../../store/learning-store';
import { useWorldsStore } from '../../store/worlds-store';
import { useLanguageConfigStore } from '../../store/language-config-store';
import { STYLE_PRESETS } from '../../constants/style-presets';
import { sfxPageTurn, sfxSparkle, sfxSuccess, sfxStoryEnd } from '../../utils/sfx';
import { BranchMap } from './BranchMap';
import { PageDesigner } from './PageDesigner';
import { VariantGallery } from './VariantGallery';
import { usePageDesignStore } from '../../store/page-design-store';
import type { GenStep } from '../../store/story-store';

// ── Narration state ────────────────────────────────────────────────────────────

interface NarrSegment {
  text: string;
  voiceId?: string;      // resolved engine voice id (not 'clone:xxx')
  url?: string;          // object URL after fetch
  words: string[];
}

type NarrStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PageNarr {
  status: NarrStatus;
  error?: string;
  segs: NarrSegment[];
  curSeg: number;        // segment currently playing (for karaoke)
  wordIdx: number;       // word index within curSeg
}

function base64ToBlob(b64: string, mime: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function tokenise(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepMeta({ gs }: { gs: GenStep }) {
  return (
    <div className="lbf-step-meta">
      <div className="lbf-step-header">
        <span>Step {gs.step}/{gs.total}</span>
        <div className="lbf-step-bar-wrap">
          <div className="lbf-step-bar-fill" style={{ width: `${Math.round(gs.pct * 100)}%` }} />
        </div>
        <span className="lbf-step-pct">{Math.round(gs.pct * 100)}%</span>
      </div>
      <div className="lbf-step-details">
        <span>{gs.elapsed_s.toFixed(1)}s</span>
        <span>{gs.it_s.toFixed(2)} it/s</span>
        {gs.config && <span>{gs.config}</span>}
        {gs.seed != null && <span>seed {gs.seed}</span>}
      </div>
      {gs.prompt && (
        <div className="lbf-step-prompt">{gs.prompt.slice(0, 90)}{gs.prompt.length > 90 ? '…' : ''}</div>
      )}
    </div>
  );
}

const RegenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.5 10A6.5 6.5 0 0 1 10 3.5a6.47 6.47 0 0 1 4.596 1.904L13 7h4V3l-1.536 1.536A8 8 0 1 0 18 10h-1.5A6.5 6.5 0 0 1 3.5 10Z" fill="#3a2e28"/>
  </svg>
);

// ── Karaoke word renderer ─────────────────────────────────────────────────────

function parsePhonicsSegments(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.filter((p) => p.text.trim());
}

function KaraText({ text, active, wordIdx, phonics, onWordClick }: {
  text: string; active: boolean; wordIdx: number; phonics?: boolean; onWordClick?: (w: string) => void;
}) {
  if (phonics) {
    const segs = parsePhonicsSegments(text);
    let globalIdx = 0;
    const els: React.ReactNode[] = [];
    for (const seg of segs) {
      const words = tokenise(seg.text);
      for (const w of words) {
        const idx = globalIdx++;
        const cls = active && idx === wordIdx ? 'kara-word kara-active' : 'kara-word';
        if (seg.bold) {
          els.push(<strong key={idx} className={cls} onClick={onWordClick ? () => onWordClick(w) : undefined}>{w} </strong>);
        } else {
          els.push(<span key={idx} className={cls} onClick={onWordClick ? () => onWordClick(w) : undefined}>{w} </span>);
        }
      }
    }
    return <>{els}</>;
  }
  const words = tokenise(text);
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className={active && i === wordIdx ? 'kara-word kara-active' : 'kara-word'} onClick={onWordClick ? () => onWordClick(w) : undefined}>{w} </span>
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Art Director suggestion type ──────────────────────────────────────────────
interface ArtSuggestion {
  suggestedStyleId: string;
  mood: string;
  ageGroup: string;
  reasoning: string;
  musicMood: string;
}

// ── Music mood options ────────────────────────────────────────────────────────
const MUSIC_MOODS = ['calm', 'playful', 'adventurous', 'dreamy', 'whimsical'] as const;
type MusicMood = typeof MUSIC_MOODS[number];

/**
 * NoFlip — wraps interactive in-page controls (regenerate overlay, narration bar,
 * branch choices). react-pageflip attaches a NATIVE mousedown/touchstart listener
 * to the page block to start a drag; that swallows clicks on buttons rendered
 * inside a page. React's synthetic stopPropagation doesn't stop the native event,
 * so we attach real bubble-phase listeners that stop pointer/mouse/touch-down from
 * ever reaching react-pageflip — the button's click then fires normally.
 */
function NoFlip({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    el.addEventListener('mousedown', stop);
    el.addEventListener('touchstart', stop, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('mousedown', stop);
      el.removeEventListener('touchstart', stop);
    };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

export function LiveBookFlip() {
  // The reader-mode switch lives INSIDE LiveBookFlipInner now: the full-featured
  // reader (toolbars, narration, regenerate, designer) gains the react-pageflip
  // page-curl when readerMode === 'pageflip', instead of swapping to a bare reader.
  return <LiveBookFlipInner />;
}

function LiveBookFlipInner() {
  const { story, cover, pages, phase, progress, genStep, regenerating, regeneratingCover, regeneratePage, regenerateCover, setStory, storyId, warns } = useStoryStore();
  const { set: setPrompt } = usePromptsStore();
  const musicStore = useMusicEngineStore();

  // Page-flip reader (react-pageflip) — same setting that drives the Library reader.
  const readerMode = usePrefsStore((st) => st.prefs.readerMode);
  const flipRef = useRef<FlipBookHandle | null>(null);
  // Read-aloud is only offered when the voice (audio) engine is actually healthy.
  const voiceOk = useAudioEngineStore((st) => st.health.ok);

  const heroSeed = useCharactersStore((s) => {
    const selected = s.characters.filter((c) => s.selectedIds.includes(c.id));
    const hero = selected.find((c) => c.role === 'hero') ?? selected[0];
    return hero?.lockedSeed ?? null;
  });
  const heroVoiceId = useCharactersStore((s) => {
    const selected = s.characters.filter((c) => s.selectedIds.includes(c.id));
    const hero = selected.find((c) => c.role === 'hero') ?? selected[0];
    return hero?.voiceId ?? null;
  });

  const [s, setS] = useState(0);
  const [narr, setNarr] = useState<Record<number, PageNarr>>({});
  const [playingPage, setPlayingPage] = useState<number | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);

  // S19 — Art Director
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [artBusy, setArtBusy] = useState(false);
  const [artSuggestion, setArtSuggestion] = useState<ArtSuggestion | null>(null);
  const [restyleBusy, setRestyleBusy] = useState(false);
  const [restyleProgress, setRestyleProgress] = useState(0);

  // S20 — Music
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [musicMood, setMusicMood] = useState<MusicMood>('playful');
  const [musicBusy, setMusicBusy] = useState(false);
  const [showMusicBar, setShowMusicBar] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // S21 — Branching reader
  const [branchSceneIdx, setBranchSceneIdx] = useState(0);
  const [branchHistory, setBranchHistory] = useState<number[]>([]);
  const [visitedBranch, setVisitedBranch] = useState<Set<number>>(new Set([0]));
  const [showBranchMap, setShowBranchMap] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  // Transient notice for tool actions (Branch / Vocab) so they never fail silently.
  const [toolNotice, setToolNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  // S22 — Language / reading level
  const [showLangPanel, setShowLangPanel] = useState(false);
  // Enabled translation languages, in the user's configured order (Settings → Language Config).
  // NOTE: select the STABLE `languages` array (filtering inside the selector returns a
  // new array each render → infinite re-render). Derive `enabledLangs` in the body.
  const allLangs = useLanguageConfigStore((s) => s.languages);
  const enabledLangs = allLangs.filter((l) => l.enabled);
  const [targetLang, setTargetLang] = useState(() => useLanguageConfigStore.getState().enabled()[0]?.id ?? 'hindi');
  const [readingLevel, setReadingLevel] = useState<'pre-reader' | 'early-reader' | 'confident-reader'>('early-reader');
  const [langBusy, setLangBusy] = useState(false);
  const [phonicsWords, setPhonicsWords] = useState('');

  // S23 — Learning / quiz / vocab tap
  const learning = useLearningStore();
  const [showQuiz, setShowQuiz] = useState(false);
  const [vocabWord, setVocabWord] = useState<string | null>(null);
  const [vocabMode, setVocabMode] = useState(false);

  // S24 — Universe
  const worlds = useWorldsStore();

  // S25 — Page Designer + Variant Gallery
  const pageDesignStore = usePageDesignStore();
  const [showDesigner, setShowDesigner] = useState(false);
  const [designerPageIdx, setDesignerPageIdx] = useState(0);
  const [showVariants, setShowVariants] = useState(false);
  const [variantsPageIdx, setVariantsPageIdx] = useState(0);
  const [showUniversePanel, setShowUniversePanel] = useState(false);
  const [newEpisode, setNewEpisode] = useState(1);
  const [newSummary, setNewSummary] = useState('');
  // Create-universe sub-modal (so a new world can be made without leaving the reader)
  const [showCreateWorld, setShowCreateWorld] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldDesc, setNewWorldDesc] = useState('');
  const [worldBusy, setWorldBusy] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Keep a ref to sceneCount so onended closures don't go stale
  const sceneCountRef = useRef(0);
  const autoAdvanceRef = useRef(autoAdvance);

  const isGenerating = phase === 'generating';
  const sceneCount = story?.scenes?.length ?? 0;
  sceneCountRef.current = sceneCount;
  autoAdvanceRef.current = autoAdvance;
  const total = sceneCount + 2;                 // spreads: cover + scenes + back

  // Resolve 'clone:id' → actual TTS voice id
  const resolveVoice = useCallback((voiceId: string | null | undefined): string => {
    if (!voiceId) return '';
    if (voiceId.startsWith('clone:')) {
      const cloneId = voiceId.slice(6);
      const vp = useVoicesStore.getState().voices.find((v) => v.id === cloneId);
      return vp?.cloneVoiceId ?? '';
    }
    return voiceId;
  }, []);

  // ── S19 — AI Art Director ─────────────────────────────────────────────────
  const runArtDirector = useCallback(async () => {
    if (!story) return;
    setArtBusy(true);
    setArtSuggestion(null);
    try {
      const summary = story.scenes.map((sc) => sc.narration || sc.title).join(' ');
      const styles = STYLE_PRESETS.map((p) => `${p.id}: ${p.description}`).join('; ');
      const res = await fetch('/api/storybook/art-director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: story.title, summary, styles }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as ArtSuggestion;
      setArtSuggestion(data);
      sfxSuccess();
    } catch { /* ignore */ } finally { setArtBusy(false); }
  }, [story]);

  const applyStyle = useCallback(async (styleId: string) => {
    const preset = STYLE_PRESETS.find((p) => p.id === styleId);
    if (!preset || !story) return;
    setRestyleBusy(true);
    setRestyleProgress(0);
    sfxSparkle();
    try {
      // 1. Update the sceneStyle prompt override
      await setPrompt('sceneStyle', preset.prompt);

      const total2 = sceneCount + 1; // cover + scenes
      let done = 0;

      // 2. Regenerate cover
      void regenerateCover();
      done++;
      setRestyleProgress(Math.round((done / total2) * 100));

      // 3. Regenerate each page sequentially
      for (let i = 0; i < sceneCount; i++) {
        await regeneratePage(i);
        done++;
        setRestyleProgress(Math.round((done / total2) * 100));
        sfxPageTurn();
      }
      sfxStoryEnd();
    } finally {
      setRestyleBusy(false);
      setRestyleProgress(0);
      setShowStylePanel(false);
    }
  }, [story, sceneCount, setPrompt, regenerateCover, regeneratePage]);

  // ── S20 — Background Music ────────────────────────────────────────────────
  const generateMusic = useCallback(async () => {
    if (!musicStore.config.url) return;
    if (!musicStore.loaded) await musicStore.init();
    setMusicBusy(true);
    try {
      const res = await fetch('/api/storybook/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: musicMood, duration: musicStore.config.options.duration, format: musicStore.config.options.format }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { audio_b64: string; format: string };
      const fmt = data.format || 'wav';
      const blob = base64ToBlob(data.audio_b64, `audio/${fmt}`);
      const url = URL.createObjectURL(blob);
      if (musicUrl) URL.revokeObjectURL(musicUrl);
      setMusicUrl(url);
      if (!musicAudioRef.current) musicAudioRef.current = new Audio();
      musicAudioRef.current.src = url;
      musicAudioRef.current.loop = true;
      musicAudioRef.current.volume = 0.35;
      void musicAudioRef.current.play();
      setShowMusicBar(true);
      sfxSuccess();
    } catch { /* ignore */ } finally { setMusicBusy(false); }
  }, [musicStore, musicMood, musicUrl]);

  const toggleMusic = useCallback(() => {
    if (!musicAudioRef.current) return;
    if (musicAudioRef.current.paused) void musicAudioRef.current.play();
    else musicAudioRef.current.pause();
  }, []);

  const stopMusic = useCallback(() => {
    if (musicAudioRef.current) { musicAudioRef.current.pause(); musicAudioRef.current.src = ''; }
    if (musicUrl) { URL.revokeObjectURL(musicUrl); setMusicUrl(null); }
    setShowMusicBar(false);
  }, [musicUrl]);

  // ── S21 — Branching helpers ───────────────────────────────────────────────
  const addBranching = useCallback(async () => {
    if (!story) return;
    if ((story.scenes?.length ?? 0) < 2) {
      setToolNotice({ kind: 'info', text: '🌳 Branching needs a longer story — generate one with 3+ pages, then add choose-your-adventure choices.' });
      return;
    }
    setBranchBusy(true);
    setToolNotice(null);
    try {
      const res = await fetch('/api/storybook/add-choices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let detail = body; try { detail = JSON.parse(body).error || body; } catch { /* */ }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = await res.json() as { story: typeof story };
      setStory(data.story);
      setBranchSceneIdx(0); setBranchHistory([]); setVisitedBranch(new Set([0]));
      sfxSuccess();
      setToolNotice({ kind: 'info', text: '🌳 Choose-your-adventure choices added — pick options on the pages.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToolNotice({ kind: 'error', text: `🌳 Couldn't add branching: ${msg}. (Is the Chat engine configured in Settings → Chat Engine?)` });
    } finally { setBranchBusy(false); }
  }, [story, setStory]);

  const pickBranchChoice = useCallback((nextIdx: number) => {
    sfxPageTurn();
    setBranchHistory((h) => [...h, branchSceneIdx]);
    setBranchSceneIdx(nextIdx);
    setVisitedBranch((v) => new Set([...v, nextIdx]));
  }, [branchSceneIdx]);

  const branchBack = useCallback(() => {
    setBranchHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setBranchSceneIdx(prev);
      return h.slice(0, -1);
    });
  }, []);

  const jumpBranchTo = useCallback((idx: number) => {
    setBranchSceneIdx(idx);
    setVisitedBranch((v) => new Set([...v, idx]));
    setShowBranchMap(false);
  }, []);

  // ── S22 — Language / level ────────────────────────────────────────────────
  const translateStory = useCallback(async () => {
    if (!story) return;
    // Resolve the selected language id → the phrase the LLM should translate into
    // (Manglish → "Malayalam in English letters…", etc.).
    const lang = useLanguageConfigStore.getState().languages.find((l) => l.id === targetLang);
    const targetLanguage = lang ? (lang.translateAs || lang.label) : targetLang;
    setLangBusy(true);
    setToolNotice(null);
    try {
      const res = await fetch('/api/storybook/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, targetLanguage }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let detail = body; try { detail = JSON.parse(body).error || body; } catch { /* */ }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = await res.json() as { story: typeof story };
      setStory(data.story);
      sfxSuccess();
      setShowLangPanel(false);
    } catch (err) {
      setToolNotice({ kind: 'error', text: `🌍 Translation failed: ${err instanceof Error ? err.message : String(err)}. (Is the Chat engine configured?)` });
    } finally { setLangBusy(false); }
  }, [story, targetLang, setStory]);

  const adaptLevel = useCallback(async (level: typeof readingLevel) => {
    if (!story) return;
    setLangBusy(true);
    try {
      const res = await fetch('/api/storybook/adapt-level', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, level }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { story: typeof story };
      setStory(data.story);
      setReadingLevel(level);
      sfxSuccess();
    } catch { /* ignore */ } finally { setLangBusy(false); }
  }, [story, setStory]);

  const applyPhonics = useCallback(async () => {
    if (!story || !phonicsWords.trim()) return;
    setLangBusy(true);
    try {
      const words = phonicsWords.split(/[,\s]+/).filter(Boolean);
      const res = await fetch('/api/storybook/phonics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, words }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { story: typeof story };
      setStory(data.story);
      learning.setPhonicsMode(true);
      sfxSuccess();
    } catch { /* ignore */ } finally { setLangBusy(false); }
  }, [story, phonicsWords, setStory, learning]);

  // ── S23 — Quiz + vocab ────────────────────────────────────────────────────
  const loadQuiz = useCallback(() => {
    if (!story || learning.packLoading || learning.pack) return;
    void learning.loadPack(story);
  }, [story, learning]);

  const lookupWord = useCallback((word: string, context: string) => {
    setVocabWord(word);
    void learning.lookupVocab(word, context);
  }, [learning]);

  // ── S24 — Universe / series ───────────────────────────────────────────────
  const linkToWorld = useCallback(async (worldId: string) => {
    const sid = storyId;
    if (!sid || !newSummary.trim()) return;
    await worlds.linkStory(worldId, sid, newEpisode, newSummary.trim());
    setShowUniversePanel(false);
    sfxSuccess();
  }, [storyId, newEpisode, newSummary, worlds]);

  // ── Segment playback engine ────────────────────────────────────────────────
  const playSegment = useCallback(async (pageIdx: number, segs: NarrSegment[], segIdx: number) => {
    if (segIdx >= segs.length) {
      // All segments done — mark ready, clear karaoke
      setNarr((prev) => ({ ...prev, [pageIdx]: { ...prev[pageIdx], status: 'ready', curSeg: 0, wordIdx: -1 } }));
      setPlayingPage(null);
      // Auto-advance — physically turn the book to the next page, then narrate it.
      if (autoAdvanceRef.current && pageIdx < sceneCountRef.current) {
        const next = pageIdx + 1;
        flipRef.current?.flipToSpread(next);
        setTimeout(() => void narratePageInner(next), 600);
      }
      return;
    }

    const seg = segs[segIdx];
    try {
      const res = await fetch('/api/storybook/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: seg.text, voice: seg.voiceId || undefined }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json();
      const fmt = data.format || 'wav';
      const blob = base64ToBlob(data.audio_b64, `audio/${fmt}`);
      const url = URL.createObjectURL(blob);

      // Store URL in segment
      setNarr((prev) => {
        const pn = prev[pageIdx];
        if (!pn) return prev;
        const newSegs = pn.segs.map((sg, i) => i === segIdx ? { ...sg, url } : sg);
        return { ...prev, [pageIdx]: { ...pn, status: 'ready', segs: newSegs, curSeg: segIdx, wordIdx: 0 } };
      });

      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;

      audioRef.current.ontimeupdate = () => {
        const audio = audioRef.current;
        if (!audio || !audio.duration) return;
        const wi = Math.min(
          seg.words.length - 1,
          Math.floor((audio.currentTime / audio.duration) * seg.words.length),
        );
        setNarr((prev) => {
          const pn = prev[pageIdx];
          if (!pn || pn.curSeg !== segIdx) return prev;
          return { ...prev, [pageIdx]: { ...pn, wordIdx: wi } };
        });
      };

      audioRef.current.onended = () => {
        void playSegment(pageIdx, segs, segIdx + 1);
      };

      await audioRef.current.play();
      setPlayingPage(pageIdx);
    } catch (err) {
      setNarr((prev) => ({ ...prev, [pageIdx]: { ...prev[pageIdx], status: 'error', error: String(err) } }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveVoice]);

  // inner fn used by playSegment for auto-advance recursion — defined after playSegment
  // eslint-disable-next-line prefer-const
  let narratePageInner: (pageIdx: number) => void;

  const narratePage = useCallback(async (pageIdx: number) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    setPlayingPage(null);

    const sc = story?.scenes[pageIdx - 1];
    if (!sc) return;

    const heroVoice = resolveVoice(heroVoiceId);

    const segs: NarrSegment[] = [];
    if (sc.narration?.trim()) segs.push({ text: sc.narration, words: tokenise(sc.narration) });
    if (sc.says?.trim()) segs.push({ text: `"${sc.says}"`, voiceId: heroVoice || undefined, words: tokenise(`"${sc.says}"`) });
    if (sc.thinks?.trim()) segs.push({ text: sc.thinks, voiceId: heroVoice || undefined, words: tokenise(sc.thinks) });

    if (!segs.length) return;

    setNarr((prev) => ({ ...prev, [pageIdx]: { status: 'loading', segs, curSeg: 0, wordIdx: -1 } }));
    await playSegment(pageIdx, segs, 0);
  }, [story, heroVoiceId, resolveVoice, playSegment]);

  // wire narratePageInner after narratePage is defined
  narratePageInner = narratePage;

  const togglePlay = useCallback((pageIdx: number) => {
    if (!audioRef.current) return;
    if (playingPage === pageIdx && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlayingPage(null);
    } else {
      void audioRef.current.play();
      setPlayingPage(pageIdx);
    }
  }, [playingPage]);

  // ── Page content ──────────────────────────────────────────────────────────
  const Left = (k: number): React.ReactNode => {
    if (k <= 0) return null;
    if (k > sceneCount) {
      return (
        <div className="bp-backcover">
          <div className="bp-bc-end">The End</div>
          <div className="bp-bc-title">{story?.title}</div>
          <div className="bp-bc-mark">📖 iStorybook</div>
        </div>
      );
    }

    // In branching mode, always show the current branch scene on the left page
    const isBranching = story?.type === 'branching' && phase === 'done';
    const sc = isBranching ? story?.scenes[branchSceneIdx] : story?.scenes[k - 1];
    const pn = narr[isBranching ? branchSceneIdx + 1 : k];
    const isDonePhase = phase === 'done';

    // Karaoke helpers
    const segActive = (segIdx: number) => playingPage === k && pn?.curSeg === segIdx;
    const segWordIdx = (segIdx: number) => segActive(segIdx) ? (pn?.wordIdx ?? -1) : -1;

    // Determine which words to render (from fetched segment or raw text)
    const narrWords = pn?.segs[0]?.words ?? tokenise(sc?.narration ?? '');
    const saysWords = pn?.segs.find((_, i) => sc?.says && i === (sc?.narration ? 1 : 0))?.words ?? tokenise(sc?.says ? `"${sc.says}"` : '');
    const thinksWords = pn?.segs[pn?.segs.length - 1]?.words ?? tokenise(sc?.thinks ?? '');

    // Segment indices into pn.segs
    const saysSegIdx = sc?.narration ? 1 : 0;
    const thinksSegIdx = (sc?.narration ? 1 : 0) + (sc?.says ? 1 : 0);

    // Download helper for a segment
    const downloadSeg = (segIdx: number, label: string) => {
      const url = pn?.segs[segIdx]?.url;
      if (!url) return;
      const a = document.createElement('a');
      a.href = url; a.download = `page-${k}-${label}.wav`; a.click();
    };

    return (
      <div className="bp-text">
        <div className="bp-num">Page {k}</div>
        <div className="bp-stitle">{sc?.title}</div>

        {sc?.narration && (
          <p className={`bp-narr${vocabMode ? ' bp-vocab-mode' : ''}`}>
            <KaraText text={sc.narration} active={segActive(0)} wordIdx={segWordIdx(0)} phonics={learning.phonicsMode} onWordClick={vocabMode ? (w) => { setVocabWord(w); lookupWord(w, sc?.narration ?? ''); } : undefined} />
          </p>
        )}
        {sc?.says && (
          <div className="bp-bubble bp-says">
            💬 &ldquo;<KaraText text={sc.says} active={segActive(saysSegIdx)} wordIdx={segWordIdx(saysSegIdx)} phonics={learning.phonicsMode} onWordClick={vocabMode ? (w) => { setVocabWord(w); lookupWord(w, sc?.says ?? ''); } : undefined} />&rdquo;
          </div>
        )}
        {sc?.thinks && (
          <div className="bp-bubble bp-thinks">
            💭 <KaraText text={sc.thinks} active={segActive(thinksSegIdx)} wordIdx={segWordIdx(thinksSegIdx)} phonics={learning.phonicsMode} onWordClick={vocabMode ? (w) => { setVocabWord(w); lookupWord(w, sc?.thinks ?? ''); } : undefined} />
          </div>
        )}

        {/* S21 — Branch choices */}
        {sc?.choices && sc.choices.length > 0 && isDonePhase && (
          <NoFlip className="lbf-choices">
            <div className="lbf-choices-label">What happens next?</div>
            {sc.choices.map((ch, ci) => (
              <button key={ci} className="lbf-choice-btn" onClick={() => pickBranchChoice(ch.nextSceneIndex)}>
                {ch.text}
              </button>
            ))}
          </NoFlip>
        )}

        {isDonePhase && voiceOk && (
          <NoFlip className="lbf-narr-bar">
            {(!pn || pn.status === 'idle') && (
              <button className="lbf-narr-btn" onClick={() => void narratePage(k)}>🔊 Read aloud</button>
            )}
            {pn?.status === 'loading' && (
              <span className="lbf-narr-loading">
                <span className="story-progress-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                Synthesising…
              </span>
            )}
            {(pn?.status === 'ready') && (
              <div className="lbf-narr-player">
                <button className="lbf-narr-play" onClick={() => togglePlay(k)}>
                  {playingPage === k ? '⏸' : '▶'}
                </button>
                <span className="lbf-narr-label">Read aloud</span>
                <button className="lbf-narr-re" onClick={() => void narratePage(k)} title="Re-synthesise">↺</button>
                {pn.segs[0]?.url && (
                  <button className="lbf-narr-dl" onClick={() => downloadSeg(0, 'narration')} title="Download audio">⬇</button>
                )}
              </div>
            )}
            {pn?.status === 'error' && (
              <button className="lbf-narr-btn lbf-narr-err" onClick={() => void narratePage(k)}>⚠ Retry</button>
            )}

            {/* Auto-advance toggle */}
            <label className="lbf-narr-auto" title="Auto-advance pages when narration ends">
              <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
              <span>auto-advance</span>
            </label>
          </NoFlip>
        )}
      </div>
    );
  };

  const Right = (k: number): React.ReactNode => {
    if (k > sceneCount) return null;

    const isDone = phase === 'done';
    const isRegenThis = k === 0 ? !!regeneratingCover : regenerating === k - 1;

    const onRegen = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (k === 0) void regenerateCover();
      else void regeneratePage(k - 1);
    };
    const onRegenLocked = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (k === 0) void regenerateCover();
      else void regeneratePage(k - 1, undefined, heroSeed);
    };

    if (k === 0) {
      if (!cover) {
        // Still generating → spinner. Generation over but no cover → it FAILED;
        // show the real reason + a retry instead of spinning forever.
        if (isGenerating || isRegenThis) {
          return (
            <div className="bp-art lbf-loading-art">
              <div className="lbf-cover-text">Creating cover page</div>
              <span className="story-progress-spinner" />
              {genStep && <StepMeta gs={genStep} />}
            </div>
          );
        }
        const coverWarn = [...warns].reverse().find((w) => /cover/i.test(w));
        return (
          <div className="bp-art lbf-failed-art">
            <div className="lbf-failed-title">⚠️ Cover image failed</div>
            {coverWarn && <div className="lbf-failed-msg">{coverWarn}</div>}
            <NoFlip className="lbf-failed-actions">
              <button className="lbf-failed-btn" onClick={(e) => { e.stopPropagation(); void regenerateCover(); }}>↻ Try again</button>
            </NoFlip>
          </div>
        );
      }
      return (
        <div className="bp-art">
          <img src={`data:image/png;base64,${cover}`} alt="Cover" draggable={false} />
          {(isDone || isRegenThis) && (
            <NoFlip className={`lbf-regen-overlay${isRegenThis ? ' lbf-regen-busy' : ''}`}>
              {isRegenThis
                ? <span className="story-progress-spinner" />
                : (
                  <>
                    <button className="lbf-regen-btn" onClick={onRegen} title="Regenerate cover"><RegenIcon /></button>
                    <button className="lbf-regen-btn" onClick={(e) => { e.stopPropagation(); setDesignerPageIdx(0); setShowDesigner(true); }} title="Design overlay elements">✏️</button>
                    <button className="lbf-regen-btn" onClick={(e) => { e.stopPropagation(); setVariantsPageIdx(0); setShowVariants(true); }} title="Image variants">🖼</button>
                  </>
                )
              }
            </NoFlip>
          )}
        </div>
      );
    }

    const page = pages[k - 1];
    if (!page?.image_b64) {
      const isCurrentAndBusy = (isGenerating && k === s) || isRegenThis;
      if (isCurrentAndBusy) {
        return (
          <div className="bp-art lbf-loading-art">
            <span className="story-progress-spinner" />
            <span className="lbf-art-label">{progress.label || 'Illustrating…'}</span>
            {genStep && <StepMeta gs={genStep} />}
          </div>
        );
      }
      // Still generating but not this page's turn yet → blank placeholder.
      if (isGenerating) return <div className="bp-art" />;
      // Generation over but this page has no image → it FAILED. Show why + retry.
      const pageWarn = [...warns].reverse().find((w) => new RegExp(`scene\\s*${k}\\b`, 'i').test(w));
      return (
        <div className="bp-art lbf-failed-art">
          <div className="lbf-failed-title">⚠️ Page {k} image failed</div>
          {pageWarn && <div className="lbf-failed-msg">{pageWarn}</div>}
          <NoFlip className="lbf-failed-actions">
            <button className="lbf-failed-btn" onClick={(e) => { e.stopPropagation(); void regeneratePage(k - 1); }}>↻ Try again</button>
          </NoFlip>
        </div>
      );
    }
    return (
      <div className="bp-art">
        <img src={`data:image/png;base64,${page.image_b64}`} alt={page.title || `Page ${k}`} draggable={false} />
        {(isDone || isRegenThis) && (
          <NoFlip className={`lbf-regen-overlay${isRegenThis ? ' lbf-regen-busy' : ''}`}>
            {isRegenThis
              ? <span className="story-progress-spinner" />
              : (
                <>
                  <button className="lbf-regen-btn" onClick={onRegen} title={`Regenerate page ${k}`}><RegenIcon /></button>
                  {heroSeed != null && (
                    <button className="lbf-regen-btn lbf-regen-lock" onClick={onRegenLocked}
                      title={`Re-roll with character lock (seed ${heroSeed})`}
                      style={{ fontSize: 13, padding: '4px 6px' }}>🔒</button>
                  )}
                  <button className="lbf-regen-btn" onClick={(e) => { e.stopPropagation(); setDesignerPageIdx(k); setShowDesigner(true); }} title="Design overlay elements">✏️</button>
                  <button className="lbf-regen-btn" onClick={(e) => { e.stopPropagation(); setVariantsPageIdx(k); setShowVariants(true); }} title="Image variants">🖼</button>
                </>
              )
            }
          </NoFlip>
        )}
      </div>
    );
  };

  const density = interiorDensity(readerMode);

  // ── Auto-advance during generation ──────────────────────────────────────────
  // As each page's illustration arrives, physically turn the book to that page so
  // the parent watches the story build itself. (Cover first, then each scene.)
  const arrivedCount = pages.filter((p) => p?.image_b64).length;
  const autoFlipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (phase !== 'generating') return;
    if (arrivedCount <= 0) return;
    // spread index == scene page number (1-based); clamp to the back spread.
    const target = Math.min(arrivedCount, sceneCount);
    // Small delay so react-pageflip has time to settle after any concurrent animation.
    if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current);
    autoFlipTimer.current = setTimeout(() => { flipRef.current?.flipToSpread(target); }, 600);
    return () => { if (autoFlipTimer.current) clearTimeout(autoFlipTimer.current); };
  }, [arrivedCount, phase, sceneCount]);

  if (!story) return null;

  const isDone = phase === 'done';

  return (
    <div className="lbf-root">
      {isGenerating && (
        <div className="lbf-progress">
          <div className="lbf-progress-inner">
            <span className="story-progress-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
            <span className="lbf-progress-label">{progress.label || 'Working…'}</span>
            <span className="lbf-progress-pct">{progress.pct}%</span>
          </div>
          <div className="story-progress-track" style={{ marginTop: 6 }}>
            <div className="story-progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {/* S19 — Restyle in-progress overlay */}
      {restyleBusy && (
        <div className="lbf-restyle-overlay">
          <div className="lbf-restyle-box">
            <span className="story-progress-spinner" style={{ width: 18, height: 18, borderWidth: 2.5 }} />
            <span className="lbf-restyle-label">Restyling… {restyleProgress}%</span>
            <div className="story-progress-track" style={{ marginTop: 8, width: 200 }}>
              <div className="story-progress-fill" style={{ width: `${restyleProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* S19 — Art Director suggestion bubble */}
      <ModalView
        open={!!artSuggestion && !restyleBusy}
        onClose={() => setArtSuggestion(null)}
        title="🎨 AI Art Director suggests"
        size="sm"
        headerColor="var(--story-accent-3)"
        headerGradient
        footerRight={artSuggestion && (
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView size="md" variant="secondary" onClick={() => { setArtSuggestion(null); setShowStylePanel(true); }}>Pick manually</ButtonView>
            <ButtonView size="md" accentColor="var(--story-accent-3)" onClick={() => void applyStyle(artSuggestion.suggestedStyleId)}>✨ Apply this style</ButtonView>
          </div>
        )}
      >
        {artSuggestion && (
          <div className="lbf-art-bubble-body">
            <div className="lbf-art-bubble-style">
              {STYLE_PRESETS.find((p) => p.id === artSuggestion.suggestedStyleId)?.label ?? artSuggestion.suggestedStyleId}
              &nbsp;·&nbsp;<em>{artSuggestion.ageGroup}</em>
              &nbsp;·&nbsp;mood: <em>{artSuggestion.mood}</em>
            </div>
            <div className="lbf-art-bubble-reason">{artSuggestion.reasoning}</div>
          </div>
        )}
      </ModalView>

      <div className="bf-stage lbf-stage">
        <FlipBook
          ref={flipRef}
          key={`live-${storyId ?? 'gen'}-${sceneCount}-${readerMode}`}
          pageCount={sceneCount}
          hint={isGenerating ? '📖 Generating your storybook…' : '← drag the right page to turn →'}
          onSpreadChange={(sp) => {
            sfxPageTurn();
            if (sp === total - 1) setTimeout(sfxStoryEnd, 350);
            setS(sp);
          }}
        >
          <FlipPage key="cover" className="pfb-cover-page" density="hard">{Right(0)}</FlipPage>
          {story.scenes.flatMap((_, i) => [
            <FlipPage key={`t${i}`} className="pfb-text-page" density={density}>{Left(i + 1)}</FlipPage>,
            <FlipPage key={`img${i}`} className="pfb-image-page" density={density}>{Right(i + 1)}</FlipPage>,
          ])}
          <FlipPage key="back" className="pfb-back-page" density="hard">{Left(total - 1)}</FlipPage>
        </FlipBook>

        {/* S19/S20 — Toolbar (only after story is done) */}
        {isDone && (
          <div className="lbf-toolbar">
            {/* Art Director */}
            <button
              className={`lbf-tool-btn${artBusy ? ' lbf-tool-busy' : ''}`}
              onClick={() => void runArtDirector()}
              disabled={artBusy}
              title="AI Art Director — suggest a style"
            >
              {artBusy ? <span className="story-progress-spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : '🎨'}
              Art Director
            </button>

            {/* Style Picker */}
            <button
              className="lbf-tool-btn"
              onClick={() => setShowStylePanel((v) => !v)}
              title="Style presets"
            >
              🖌 Styles
            </button>

            {/* Music */}
            {musicStore.config.url && (
              <button
                className={`lbf-tool-btn${musicBusy ? ' lbf-tool-busy' : ''}`}
                onClick={() => void generateMusic()}
                disabled={musicBusy}
                title="Generate background music"
              >
                {musicBusy ? <span className="story-progress-spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : '🎵'}
                Score
              </button>
            )}

            {/* Music mood selector — shown when no music yet */}
            {musicStore.config.url && !musicUrl && (
              <select
                className="lbf-mood-select"
                value={musicMood}
                onChange={(e) => setMusicMood(e.target.value as MusicMood)}
              >
                {MUSIC_MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            {/* S21 — Branching */}
            <button
              className={`lbf-tool-btn${branchBusy ? ' lbf-tool-busy' : ''}`}
              onClick={() => story?.type === 'branching' ? setShowBranchMap(true) : void addBranching()}
              disabled={branchBusy}
              title={story?.type === 'branching' ? 'View branch map' : 'Make choose-your-adventure'}
            >
              {branchBusy ? <span className="story-progress-spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : '🌳'}
              {story?.type === 'branching' ? 'Map' : 'Branch'}
            </button>

            {/* S22 — Language */}
            <button
              className="lbf-tool-btn"
              onClick={() => setShowLangPanel((v) => !v)}
              title="Translate or adapt reading level"
            >
              🌍 Language
            </button>

            {/* S23 — Learning / Quiz */}
            <button
              className={`lbf-tool-btn${learning.packLoading ? ' lbf-tool-busy' : ''}`}
              onClick={() => { loadQuiz(); setShowQuiz(true); }}
              disabled={learning.packLoading}
              title="Comprehension quiz + SEL skill"
            >
              {learning.packLoading ? <span className="story-progress-spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : '🎓'}
              Learn
            </button>

            {/* S23 — Vocab tap mode */}
            <button
              className={`lbf-tool-btn${vocabMode ? ' lbf-tool-active' : ''}`}
              onClick={() => setVocabMode((v) => {
                const next = !v;
                setToolNotice(next
                  ? { kind: 'info', text: '📚 Vocab mode ON — tap any word in the story text to look it up.' }
                  : { kind: 'info', text: '📚 Vocab mode off.' });
                return next;
              })}
              title="Tap any word to look it up"
            >
              📚 Vocab{vocabMode ? ' ●' : ''}
            </button>

            {/* S24 — Universe */}
            {storyId && (
              <button
                className="lbf-tool-btn"
                onClick={() => { void worlds.load(); setShowUniversePanel(true); }}
                title="Add to a story universe / series"
              >
                🪐 Universe
              </button>
            )}
          </div>
        )}

        {/* Tool notice — Branch / Vocab feedback so actions never fail silently */}
        {toolNotice && (
          <div className={`lbf-tool-notice${toolNotice.kind === 'error' ? ' is-error' : ''}`} role="status">
            <span>{toolNotice.text}</span>
            <button className="lbf-tool-notice-x" onClick={() => setToolNotice(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* S19 — Style picker panel */}
        <ModalView
          open={showStylePanel}
          onClose={() => setShowStylePanel(false)}
          title="🖌 Choose Illustration Style"
          subtitle="Pick a style — every page re-illustrates to match."
          size="lg"
          headerColor="var(--story-accent-3)"
          headerGradient
        >
          <div className="lbf-style-grid">
            {STYLE_PRESETS.map((p) => (
              <button
                key={p.id}
                className="lbf-style-chip"
                style={{ ['--style-accent' as string]: p.accent }}
                onClick={() => void applyStyle(p.id)}
                disabled={restyleBusy}
              >
                <span className="lbf-style-chip-label">{p.label}</span>
                <span className="lbf-style-chip-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </ModalView>

        {/* S20 — Music mini-player */}
        {showMusicBar && musicUrl && (
          <div className="lbf-music-bar">
            <span className="lbf-music-icon">🎵</span>
            <span className="lbf-music-label">{musicMood} score</span>
            <button className="lbf-music-btn" onClick={toggleMusic}>
              {musicAudioRef.current?.paused ? '▶' : '⏸'}
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              defaultValue={0.35}
              className="lbf-music-vol"
              onChange={(e) => { if (musicAudioRef.current) musicAudioRef.current.volume = Number(e.target.value); }}
            />
            <button className="lbf-music-btn lbf-music-stop" onClick={stopMusic} title="Stop & remove music">✕</button>
          </div>
        )}

        {/* S21 — Branching back button (shown while in branching mode) */}
        {story?.type === 'branching' && isDone && (
          <div className="lbf-branch-nav">
            <button className="lbf-branch-nav-btn" onClick={branchBack} disabled={!branchHistory.length}>← Back</button>
            <span className="lbf-branch-nav-scene">Scene {branchSceneIdx + 1} · {story.scenes[branchSceneIdx]?.title}</span>
            <button className="lbf-branch-nav-btn" onClick={() => setShowBranchMap(true)}>🌳 Map</button>
          </div>
        )}

        {/* S22 — Language panel */}
        <ModalView
          open={showLangPanel}
          onClose={() => setShowLangPanel(false)}
          title="🌍 Language & Reading Level"
          subtitle="Translate, adapt the reading level, or focus on phonics."
          size="sm"
          headerColor="var(--story-accent-3)"
          headerGradient
        >
          <div className="lbf-lang-section">
            <div className="lbf-lang-label">Translate to</div>
            <div className="lbf-lang-row">
              <SelectInputView
                size="sm"
                value={targetLang}
                onChange={(v) => setTargetLang(v as string)}
                options={enabledLangs.map((l) => ({ value: l.id, label: l.label }))}
              />
              <ButtonView size="sm" accentColor="var(--story-accent-3)" disabled={langBusy} loading={langBusy} onClick={() => void translateStory()}>
                Translate
              </ButtonView>
            </div>
          </div>

          <div className="lbf-lang-section">
            <div className="lbf-lang-label">Reading level</div>
            <div className="lbf-level-chips">
              {(['pre-reader', 'early-reader', 'confident-reader'] as const).map((lvl) => (
                <ButtonView
                  key={lvl} size="sm" disabled={langBusy}
                  variant={readingLevel === lvl ? 'primary' : 'secondary'}
                  accentColor="var(--story-accent-3)"
                  onClick={() => void adaptLevel(lvl)}
                >{lvl}</ButtonView>
              ))}
            </div>
          </div>

          <div className="lbf-lang-section">
            <div className="lbf-lang-label">Phonics focus words</div>
            <div className="lbf-lang-row">
              <TextInputView
                width="fw" size="sm"
                placeholder="e.g. cat, the, and, see"
                value={phonicsWords}
                onChange={(e) => setPhonicsWords((e.target as HTMLInputElement).value)}
              />
              <ButtonView size="sm" accentColor="var(--story-accent-3)" disabled={langBusy || !phonicsWords.trim()} onClick={() => void applyPhonics()}>
                Apply
              </ButtonView>
            </div>
            {learning.phonicsMode && (
              <ButtonView size="sm" variant="secondary" onClick={() => learning.setPhonicsMode(false)}>✕ Clear phonics</ButtonView>
            )}
          </div>
        </ModalView>

        {/* S23 — Reading Check (quiz) */}
        <ModalView
          open={showQuiz}
          onClose={() => setShowQuiz(false)}
          title="🎓 Reading Check"
          subtitle="A quick comprehension quiz + a social-emotional skill."
          size="md"
          headerColor="var(--story-accent-3)"
          headerGradient
        >
          {learning.packLoading && <div className="lbf-quiz-loading"><span className="story-progress-spinner" /> Generating quiz…</div>}
          {learning.packError && <div className="lbf-quiz-error">⚠ {learning.packError}</div>}

          {learning.pack && (
            <>
              {/* SEL skill badge */}
              <div className="lbf-sel-badge">
                <span className="lbf-sel-icon">💛</span>
                <div>
                  <div className="lbf-sel-skill">{learning.pack.selSkill}</div>
                  <div className="lbf-sel-desc">{learning.pack.selDescription}</div>
                </div>
              </div>

              {/* Questions */}
              {learning.pack.questions.map((q, qi) => (
                <div key={qi} className="lbf-quiz-q">
                  <div className="lbf-quiz-q-text">{qi + 1}. {q.q}</div>
                  <div className="lbf-quiz-opts">
                    {q.options.map((opt, oi) => {
                      const chosen = learning.quizAnswers[qi] === oi;
                      const correct = learning.quizRevealed && oi === q.answer;
                      const wrong = learning.quizRevealed && chosen && oi !== q.answer;
                      return (
                        <button
                          key={oi}
                          className={`lbf-quiz-opt${chosen ? ' chosen' : ''}${correct ? ' correct' : ''}${wrong ? ' wrong' : ''}`}
                          onClick={() => learning.answerQuestion(qi, oi)}
                          disabled={learning.quizRevealed}
                        >{opt}</button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="lbf-quiz-actions">
                {!learning.quizRevealed
                  ? <ButtonView size="md" accentColor="var(--story-accent-3)" onClick={learning.revealQuiz}>Check answers</ButtonView>
                  : <ButtonView size="md" variant="secondary" onClick={() => { learning.resetQuiz(); }}>Try again</ButtonView>
                }
              </div>

              {/* Parent prompts */}
              <details className="lbf-parent-prompts">
                <summary>💬 Talk-about-it prompts for parents</summary>
                <ul>
                  {learning.pack.parentPrompts.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </details>
            </>
          )}
        </ModalView>

        {/* S23 — Vocab card popup */}
        <ModalView
          open={!!vocabWord}
          onClose={() => setVocabWord(null)}
          title="📚 Vocabulary"
          size="sm"
          headerColor="var(--story-accent-3)"
          headerGradient
        >
          {(() => {
            const card = vocabWord ? learning.vocab[vocabWord.toLowerCase()] : null;
            return card ? (
              <div className="lbf-vocab-card-body">
                <div className="lbf-vocab-word">{card.word}</div>
                <div className="lbf-vocab-def">{card.loading ? 'Looking up…' : card.definition}</div>
              </div>
            ) : <div className="lbf-vocab-def">Looking up…</div>;
          })()}
        </ModalView>

        {/* S24 — Universe panel */}
        <ModalView
          open={showUniversePanel}
          onClose={() => setShowUniversePanel(false)}
          title="🪐 Add to Universe"
          subtitle="Link this story into a series / shared world."
          size="sm"
          headerColor="var(--story-accent-3)"
          headerGradient
          footerRight={
            <ButtonView size="md" accentColor="var(--story-accent-3)" iconLeft={<PlusIcon size={13} />}
              onClick={() => { setNewWorldName(''); setNewWorldDesc(''); setShowCreateWorld(true); }}>
              New universe
            </ButtonView>
          }
        >
          {worlds.worlds.length === 0 && (
            <p className="lbf-quiz-loading">No worlds yet — click <b>New universe</b> below to create your first one.</p>
          )}
          {worlds.worlds.map((w) => (
            <div key={w.id} className="lbf-world-row">
              <div className="lbf-world-name">🪐 {w.name}</div>
              <TextInputView
                width="fw" size="sm"
                placeholder="Episode #"
                value={String(newEpisode)}
                onChange={(e) => setNewEpisode(Number((e.target as HTMLInputElement).value) || 1)}
              />
              <TextInputView
                width="fw" size="sm"
                placeholder="Short summary of this episode…"
                value={newSummary}
                onChange={(e) => setNewSummary((e.target as HTMLInputElement).value)}
              />
              <ButtonView size="sm" accentColor="var(--story-accent-3)" onClick={() => void linkToWorld(w.id)}>
                Link
              </ButtonView>
            </div>
          ))}
        </ModalView>

        {/* S24 — Create a new universe (nested modal, same as Settings → Universe) */}
        <ModalView
          open={showCreateWorld}
          onClose={() => setShowCreateWorld(false)}
          title="🪐 New Universe"
          subtitle="A shared world your stories can belong to (a series)."
          size="sm"
          headerColor="var(--story-accent-3)"
          headerGradient
          footerRight={
            <div style={{ display: 'flex', gap: 8 }}>
              <ButtonView size="md" variant="secondary" onClick={() => setShowCreateWorld(false)}>Cancel</ButtonView>
              <ButtonView size="md" accentColor="var(--story-accent-3)" disabled={!newWorldName.trim() || worldBusy} loading={worldBusy}
                onClick={async () => {
                  if (!newWorldName.trim()) return;
                  setWorldBusy(true);
                  try { await worlds.create(newWorldName.trim(), newWorldDesc.trim()); await worlds.load(); sfxSuccess(); setShowCreateWorld(false); }
                  finally { setWorldBusy(false); }
                }}>
                Create universe
              </ButtonView>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="lbf-lang-label">Name</span>
              <TextInputView width="fw" size="md" placeholder="e.g. The Brave Bunny Saga"
                value={newWorldName} onChange={(e) => setNewWorldName((e.target as HTMLInputElement).value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="lbf-lang-label">Description <span style={{ opacity: 0.6 }}>(optional)</span></span>
              <TextInputView width="fw" size="md" placeholder="What ties these stories together?"
                value={newWorldDesc} onChange={(e) => setNewWorldDesc((e.target as HTMLInputElement).value)} />
            </div>
          </div>
        </ModalView>
      </div>

      {/* S21 — Branch map modal */}
      {showBranchMap && story?.type === 'branching' && (
        <BranchMap
          scenes={story.scenes}
          currentIndex={branchSceneIdx}
          visitedIndices={visitedBranch}
          onJump={jumpBranchTo}
          onClose={() => setShowBranchMap(false)}
        />
      )}

      {/* S25 — Page Designer overlay */}
      {showDesigner && storyId && (
        <PageDesigner
          storyId={storyId}
          pageIdx={designerPageIdx}
          imageSrc={designerPageIdx === 0
            ? `data:image/png;base64,${cover}`
            : `data:image/png;base64,${pages[designerPageIdx - 1]?.image_b64 || ''}`}
          onClose={() => setShowDesigner(false)}
        />
      )}

      {/* S25 — Variant gallery overlay */}
      {showVariants && storyId && (
        <VariantGallery
          storyId={storyId}
          pageIdx={variantsPageIdx}
          currentImage={variantsPageIdx === 0
            ? `data:image/png;base64,${cover}`
            : `data:image/png;base64,${pages[variantsPageIdx - 1]?.image_b64 || ''}`}
          onClose={() => setShowVariants(false)}
        />
      )}
    </div>
  );
}
