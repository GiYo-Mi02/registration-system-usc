alter table public.email_log
  add column delivery_status text not null default 'queued',
  add column provider_message_id text,
  add column provider_response text,
  add column accepted_recipients text[] not null default '{}'::text[],
  add column rejected_recipients text[] not null default '{}'::text[],
  add column last_attempt_at timestamptz,
  add column attempt_count integer not null default 0;

update public.email_log
set delivery_status = case
      when status = 'sent' then 'legacy_sent'
      when error_message = 'queued' then 'queued'
      else 'failed'
    end,
    last_attempt_at = case when error_message = 'queued' then null else sent_at end,
    attempt_count = case when error_message = 'queued' then 0 else 1 end;

alter table public.email_log
  add constraint email_log_delivery_status_check
    check (delivery_status = any (array[
      'queued'::text,
      'smtp_accepted'::text,
      'failed'::text,
      'simulated'::text,
      'legacy_sent'::text
    ])),
  add constraint email_log_attempt_count_check
    check (attempt_count >= 0);

comment on column public.email_log.delivery_status is
  'Transport state only. smtp_accepted means the SMTP server accepted the message; it does not guarantee inbox delivery.';

comment on column public.email_log.provider_message_id is
  'Message-ID returned by the configured email transport for support and tracing.';

comment on column public.email_log.provider_response is
  'Final SMTP response recorded for the latest delivery attempt.';

comment on column public.email_log.accepted_recipients is
  'Recipient addresses accepted by the SMTP server during the latest attempt.';

comment on column public.email_log.rejected_recipients is
  'Recipient addresses rejected by the SMTP server during the latest attempt.';

comment on column public.email_log.last_attempt_at is
  'Timestamp of the latest real or simulated delivery attempt.';

comment on column public.email_log.attempt_count is
  'Number of delivery attempts recorded by the application.';
