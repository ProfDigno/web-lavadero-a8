do $migration$
declare
  old_id integer;
  new_id integer;
begin
  select idusuario_roll_evento into old_id from usuario_roll_evento where codigo_evento = 'caja-desabilitar';
  select idusuario_roll_evento into new_id from usuario_roll_evento where codigo_evento = 'caja-ocultar';
  if old_id is not null and new_id is null then
    update usuario_roll_evento set codigo_evento = 'caja-ocultar', nombre = 'OCULTAR CAJA' where idusuario_roll_evento = old_id;
  elsif old_id is not null and new_id is not null then
    delete from usuario_roll_item old_item
    where old_item.fk_idusuario_roll_evento = old_id
      and exists (select 1 from usuario_roll_item new_item where new_item.fk_idusuario_roll_evento = new_id and new_item.fk_idusuario_roll = old_item.fk_idusuario_roll);
    update usuario_roll_item set fk_idusuario_roll_evento = new_id where fk_idusuario_roll_evento = old_id;
    delete from usuario_roll_evento where idusuario_roll_evento = old_id;
  end if;

  select idusuario_roll_evento into old_id from usuario_roll_evento where codigo_evento = 'cierre_caja-desabilitar';
  select idusuario_roll_evento into new_id from usuario_roll_evento where codigo_evento = 'cierre_caja-ocultar';
  if old_id is not null and new_id is null then
    update usuario_roll_evento set codigo_evento = 'cierre_caja-ocultar', nombre = 'OCULTAR CIERRE DE CAJA' where idusuario_roll_evento = old_id;
  elsif old_id is not null and new_id is not null then
    delete from usuario_roll_item old_item
    where old_item.fk_idusuario_roll_evento = old_id
      and exists (select 1 from usuario_roll_item new_item where new_item.fk_idusuario_roll_evento = new_id and new_item.fk_idusuario_roll = old_item.fk_idusuario_roll);
    update usuario_roll_item set fk_idusuario_roll_evento = new_id where fk_idusuario_roll_evento = old_id;
    delete from usuario_roll_evento where idusuario_roll_evento = old_id;
  end if;

  select idusuario_roll_evento into old_id from usuario_roll_evento where codigo_evento = 'gasto-desabilitar';
  select idusuario_roll_evento into new_id from usuario_roll_evento where codigo_evento = 'gasto-ocultar';
  if old_id is not null and new_id is null then
    update usuario_roll_evento set codigo_evento = 'gasto-ocultar', nombre = 'OCULTAR GASTO' where idusuario_roll_evento = old_id;
  elsif old_id is not null and new_id is not null then
    delete from usuario_roll_item old_item
    where old_item.fk_idusuario_roll_evento = old_id
      and exists (select 1 from usuario_roll_item new_item where new_item.fk_idusuario_roll_evento = new_id and new_item.fk_idusuario_roll = old_item.fk_idusuario_roll);
    update usuario_roll_item set fk_idusuario_roll_evento = new_id where fk_idusuario_roll_evento = old_id;
    delete from usuario_roll_evento where idusuario_roll_evento = old_id;
  end if;

  select idusuario_roll_evento into old_id from usuario_roll_evento where codigo_evento = 'servicio-desabilitar';
  select idusuario_roll_evento into new_id from usuario_roll_evento where codigo_evento = 'servicio-ocultar';
  if old_id is not null and new_id is null then
    update usuario_roll_evento set codigo_evento = 'servicio-ocultar', nombre = 'OCULTAR SERVICIO' where idusuario_roll_evento = old_id;
  elsif old_id is not null and new_id is not null then
    delete from usuario_roll_item old_item
    where old_item.fk_idusuario_roll_evento = old_id
      and exists (select 1 from usuario_roll_item new_item where new_item.fk_idusuario_roll_evento = new_id and new_item.fk_idusuario_roll = old_item.fk_idusuario_roll);
    update usuario_roll_item set fk_idusuario_roll_evento = new_id where fk_idusuario_roll_evento = old_id;
    delete from usuario_roll_evento where idusuario_roll_evento = old_id;
  end if;
end
$migration$;
