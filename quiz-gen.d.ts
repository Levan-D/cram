// Types for quiz-gen.js (plain JS so the Electron main process can run it as is). Keep in sync.

export const QUIZ_FORMAT: string;
export function idStem(noteRel: string): string;
export function nextIds(noteRel: string, ids: string[]): { stem: string; next: number; id(n: number): string };
export function buildQuizPrompt(opts: { noteRel: string; noteText: string; oldQuiz?: string | null }): string;
export function cleanReply(reply: string): { body: string; firstLine: number };

export interface PreparedQuiz {
  ok: boolean;
  text: string;          // the stamped quiz file ('' when there are errors)
  errors: string[];
  warnings: string[];
  questions: number;     // in the resulting file
  kept: number;          // old questions kept as they were
  written: number;       // questions taken from the reply
  dropped: number;       // old questions that are gone
}

export function prepareQuiz(opts: {
  noteRel: string;
  noteText: string;
  oldQuiz?: string | null;
  reply?: string;
  date: string;
  keepAll?: boolean;
}): PreparedQuiz;
