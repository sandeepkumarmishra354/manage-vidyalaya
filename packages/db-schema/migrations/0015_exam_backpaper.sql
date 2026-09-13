-- 0015_exam_backpaper.sql
-- A back-paper/supplementary exam is just another `exams` row, typed and
-- linked back to the original -- no change needed to exam_marks.

ALTER TABLE exams ADD COLUMN exam_type TEXT NOT NULL DEFAULT 'regular'; -- regular | back_paper | supplementary | unit_test | term
ALTER TABLE exams ADD COLUMN parent_exam_id TEXT REFERENCES exams(id);
ALTER TABLE exams ADD COLUMN passing_percentage REAL NOT NULL DEFAULT 33.0;
