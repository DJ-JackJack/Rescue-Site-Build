-- What Would You Do?: a line for each answer, 2026-11-24. line_1 is what the game says when a child picks the first
-- answer, line_2 the second, and so on, like Go on Green's line for each light. Taea writes one for each wrong answer
-- (a gentle line that teaches, often ending in a question to think about before the second try); the best answer's
-- line is left empty. A wrong answer with no line of its own gets the scenario's hint instead.

alter table public.game_scenarios
  add column if not exists line_1 text check (length(line_1) <= 400),
  add column if not exists line_2 text check (length(line_2) <= 400),
  add column if not exists line_3 text check (length(line_3) <= 400),
  add column if not exists line_4 text check (length(line_4) <= 400),
  add column if not exists line_5 text check (length(line_5) <= 400);
