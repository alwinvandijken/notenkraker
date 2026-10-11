-- Rol kiezen in beheer: een admin maakt iemand leerling, ouder of leraar vanuit de app,
-- zonder het Supabase-dashboard. Admin maken kan alleen in het dashboard, en de admin wijzigt
-- zijn eigen rol hier niet (anders sluit hij zichzelf buiten). Wie leerling wordt en nog geen
-- eigen leerlingprofiel heeft, krijgt er een (net als bij choose_role).
create or replace function public.set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.profiles;
begin
  if not public.is_admin() then raise exception 'geen toegang'; end if;
  if p_role is null or p_role not in ('leerling','ouder','leraar') then raise exception 'rol niet toegestaan'; end if;
  if p_user = auth.uid() then raise exception 'niet je eigen rol'; end if;
  update public.profiles set role = p_role where id = p_user returning * into target;
  if target.id is null then raise exception 'onbekend account'; end if;
  if p_role = 'leerling' and not exists (select 1 from public.students where user_id = p_user) then
    perform public.create_own_student(p_user, target.display_name);
  end if;
end $$;
revoke execute on function public.set_role(uuid, text) from public, anon;
grant execute on function public.set_role(uuid, text) to authenticated;
