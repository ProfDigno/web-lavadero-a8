do $migration$
declare
  duplicate_record record;
begin
  for duplicate_record in
    select fk_idusuario_roll, fk_idusuario_roll_evento,
           array_agg(idusuario_roll_item order by idusuario_roll_item) as ids
    from usuario_roll_item
    group by fk_idusuario_roll, fk_idusuario_roll_evento
    having count(*) > 1
  loop
    delete from usuario_roll_item
    where idusuario_roll_item = any(duplicate_record.ids[2:array_length(duplicate_record.ids, 1)]);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'usuario_roll_item_roll_evento_key'
      and conrelid = 'public.usuario_roll_item'::regclass
  ) then
    alter table usuario_roll_item
      add constraint usuario_roll_item_roll_evento_key
      unique (fk_idusuario_roll, fk_idusuario_roll_evento);
  end if;
end
$migration$;
