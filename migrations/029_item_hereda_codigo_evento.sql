do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuario_roll_item'
      and column_name = 'codigo_item'
  ) then
    alter table usuario_roll_item drop constraint if exists usuario_roll_item_codigo_key;
    alter table usuario_roll_item drop column codigo_item;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuario_roll_item'
      and column_name = 'nombre'
  ) then
    alter table usuario_roll_item drop column nombre;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuario_roll_item'
      and column_name = 'fk_idusuario_roll_evento'
  ) then
    alter table usuario_roll_item alter column fk_idusuario_roll_evento set not null;
  end if;
end
$migration$;

drop index if exists usuario_roll_item_codigo_idx;
