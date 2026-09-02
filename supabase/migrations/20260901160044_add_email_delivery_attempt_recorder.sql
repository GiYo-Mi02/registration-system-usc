create or replace function public.record_email_delivery_attempt(
  p_student_id uuid,
  p_status text,
  p_error_message text,
  p_delivery_status text,
  p_provider_message_id text,
  p_provider_response text,
  p_accepted_recipients text[],
  p_rejected_recipients text[],
  p_email_html text,
  p_qr_data_url text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  insert into public.email_log (
    student_id,
    status,
    error_message,
    sent_at,
    email_html,
    qr_data_url,
    delivery_status,
    provider_message_id,
    provider_response,
    accepted_recipients,
    rejected_recipients,
    last_attempt_at,
    attempt_count
  )
  values (
    p_student_id,
    p_status,
    p_error_message,
    now(),
    p_email_html,
    p_qr_data_url,
    p_delivery_status,
    p_provider_message_id,
    p_provider_response,
    coalesce(p_accepted_recipients, '{}'::text[]),
    coalesce(p_rejected_recipients, '{}'::text[]),
    now(),
    1
  )
  on conflict (student_id) do update
  set status = excluded.status,
      error_message = excluded.error_message,
      sent_at = excluded.sent_at,
      email_html = excluded.email_html,
      qr_data_url = excluded.qr_data_url,
      delivery_status = excluded.delivery_status,
      provider_message_id = excluded.provider_message_id,
      provider_response = excluded.provider_response,
      accepted_recipients = excluded.accepted_recipients,
      rejected_recipients = excluded.rejected_recipients,
      last_attempt_at = excluded.last_attempt_at,
      attempt_count = public.email_log.attempt_count + 1;
$function$;

comment on function public.record_email_delivery_attempt(
  uuid, text, text, text, text, text, text[], text[], text, text
) is
  'Atomically records the latest SMTP attempt and increments its attempt count. Intended for service-role application handlers only.';

revoke all on function public.record_email_delivery_attempt(
  uuid, text, text, text, text, text, text[], text[], text, text
) from public, anon, authenticated;

grant execute on function public.record_email_delivery_attempt(
  uuid, text, text, text, text, text, text[], text[], text, text
) to service_role;
