alter table public.students
  add column if not exists program text,
  add column if not exists section text;

comment on column public.students.program is
  'Student academic program or degree, supplied during registration/import.';

comment on column public.students.section is
  'Student class section, supplied during registration/import.';

alter table public.students
  add constraint students_program_not_blank
    check (program is null or btrim(program) <> '') not valid,
  add constraint students_section_not_blank
    check (section is null or btrim(section) <> '') not valid;

alter table public.students validate constraint students_program_not_blank;
alter table public.students validate constraint students_section_not_blank;
