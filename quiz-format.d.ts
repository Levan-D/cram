// Types for quiz-format.js (plain JS so the Electron main process and `npm run quiz` can run it
// as is). Keep in sync with that file.

export type QuestionType = 'single' | 'multi' | 'input' | 'recall';

export interface QuizOption { text: string; correct: boolean }

export interface ParsedQuestion {
  id: string;
  concept: string;
  type: QuestionType;
  section: string;
  prompt: string;
  options: QuizOption[];
  answers: string[];
  explain: string;
  line: number;
}

export interface QuizMeta {
  note: string;
  noteHash: string;
  synced: string;
  sections: { hash: string; path: string }[];
}

export interface QuizProblem { line: number; msg: string }

export interface ParsedQuiz {
  meta: QuizMeta;
  title: string;
  questions: ParsedQuestion[];
  errors: QuizProblem[];
  warnings: QuizProblem[];
}

export interface NoteSection { path: string; level: number; line: number; hash: string }

export const QUESTION_TYPES: QuestionType[];
export function conceptOf(id: string): string;
export function fingerprint(text: string): string;
export function quizPathFor(noteRel: string): string;
export function notePathFor(quizRel: string): string;
export function isQuizFile(name: string): boolean;
export function noteSections(noteText: string): NoteSection[];
export function noteFingerprint(noteText: string): string;
export function parseQuiz(text: string): ParsedQuiz;
export function compareSections(quizMeta: QuizMeta, noteText: string): {
  inSync: boolean;
  changed: string[];
  added: string[];
  removed: string[];
  sections: NoteSection[];
};
export function stampQuiz(quizText: string, noteRel: string, noteText: string, date: string): string;
export function normalizeAnswer(s: string): string;
export function answerMatches(given: string, accepted: string[]): boolean;
