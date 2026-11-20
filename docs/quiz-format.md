# Quiz files

Cram's quizzes are plain markdown files, one per note, in a `quizzes/` folder next to the notes folder.

- `quizzes/<folder>/<note>.quiz.md` mirrors `notes/<folder>/<note>.md`. A folder quiz in the app = every quiz file under that folder.
- The easy way to make one: open the quiz page for a note and use **Create quiz** (any AI chat writes it, the app checks and saves it). When the note changes, **Update quiz** rewrites only the questions of the changed sections. You can also write or edit these files by hand.
- `results.jsonl` (one line per quiz you take) and `activity.json` (Pomodoro counts) are written by the app.
- From a clone of the app's repo, `npm run quiz -- status --notes <notes dir> --quizzes <quizzes dir>` shows every note: how many questions, whether the quiz is **in sync** or **STALE** (and which sections changed), or has no quiz yet. `check` validates, `sections <note>` prints a note's section names, `stamp <quiz>` records the note's current fingerprints after editing by hand.

## File format

Illustration only (a made-up note, not one of yours):

```markdown
---
note: css/box-model.md
note-hash: 3f9a1c2b
synced: 2026-10-25
sections:
  - 8d0e4a11 Box model
  - 51c2f0aa Box model > box-sizing
---

# Box model

## Box model > box-sizing

### css-001 · single
A card has `width: 200px; padding: 20px; border: 1px solid`. With `box-sizing: border-box`, how wide is it on screen?

- [ ] 242px
- [x] 200px
- [ ] 240px
- [ ] 222px

> With `border-box`, `width` already includes padding and border, so the box stays 200px and the content shrinks to 158px. 242px is the `content-box` answer (200 + 2×20 + 2×1).

### css-001b · recall
Why do most resets set `box-sizing: border-box` on everything?

> Because then `width` means the size you actually see: padding and border eat into the content instead of growing the box, so layouts stop overflowing when you add padding.
```

**Front matter** (written by the app when it saves a quiz, or by `npm run quiz -- stamp <quiz>`; never by hand): the note it belongs to, a fingerprint of the whole note, the sync date, and one fingerprint per note section. When the note changes, comparing fingerprints shows exactly which sections changed.

**`## <section path>`** groups questions under the note section they test, written exactly as the app names the note's sections (`Parent > Child`; a note's single `# title` names the intro; backticks and bold markers are dropped). The Create quiz prompt lists them, and `npm run quiz -- sections <note>` prints them. The app uses it to label questions and jump to the section.

**`### <id> · <type>`** starts a question. Ids are short and stable (`dsa-001`, `db-014`): the app's stats are keyed by them, so once a quiz has been taken its ids are never renumbered or reused.

**Variants:** rewordings of the same idea share the id stem and add a letter: `css-014`, `css-014b`, `css-014c`. A quiz asks at most one variant per idea, picking the one you've seen least, so repeated quizzes stay fresh.

| Type | Answer part | In the app |
| --- | --- | --- |
| `single` | `- [ ]` options, exactly one `- [x]` | Pick one (click or 1–9) |
| `multi` | `- [ ]` options, one or more `- [x]` | Pick all that apply, then submit |
| `input` | `Answer: border-box \| border box` (alternatives separated by ` \| `) | Type it. Case, spaces, backticks, quotes and brackets don't matter, so `O(log n)` = `o(logn)` and `{3, 4}` = `[3,4]` = `3,4` (commas do). When case matters (`curl -i` vs `-I`), use `single` instead |
| `recall` | none: the `>` blockquote is the model answer | Think (or type) your answer, reveal, grade yourself: missed / partly / got it |

Every question ends with a **`>` blockquote**: the explanation (why it's right, why the tempting wrong answer is wrong). For `recall` it's the model answer.

Order inside a question: prompt (any markdown: code blocks, lists, math), then options or `Answer:`, then the `>` blockquote. Options are one line each and get shuffled in the app.
