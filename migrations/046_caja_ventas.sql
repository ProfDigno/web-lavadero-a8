do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'caja_sesion_movimientos'
      and column_name = 'fk_idventa'
  ) then
    alter table caja_sesion_movimientos add column fk_idventa integer references venta(idventa) on delete restrict;
  end if;
end
$$;

alter table caja_sesion_movimientos
  drop constraint if exists caja_sesion_movimientos_origen_check,
  drop constraint if exists caja_sesion_movimientos_un_origen_check,
  drop constraint if exists caja_sesion_movimientos_origen_tipo_check;

alter table caja_sesion_movimientos
  add constraint caja_sesion_movimientos_origen_check
    check (origen in ('LAVADO', 'CREDITO', 'GASTO', 'VALE', 'VENTA')),
  add constraint caja_sesion_movimientos_un_origen_check
    check (
      (case when fk_idlavado is not null then 1 else 0 end
       + case when fk_idgrupo_cliente_creditos is not null then 1 else 0 end
       + case when fk_idgasto is not null then 1 else 0 end
       + case when fk_idvales_personal is not null then 1 else 0 end
       + case when fk_idventa is not null then 1 else 0 end) = 1
    ),
  add constraint caja_sesion_movimientos_origen_tipo_check
    check (
      (origen = 'LAVADO' and tipo = 'INGRESO' and fk_idlavado is not null
        and fk_idgrupo_cliente_creditos is null and fk_idgasto is null and fk_idvales_personal is null and fk_idventa is null)
      or (origen = 'CREDITO' and tipo = 'INGRESO' and fk_idgrupo_cliente_creditos is not null
        and fk_idlavado is null and fk_idgasto is null and fk_idvales_personal is null and fk_idventa is null)
      or (origen = 'GASTO' and tipo = 'EGRESO' and fk_idgasto is not null
        and fk_idlavado is null and fk_idgrupo_cliente_creditos is null and fk_idvales_personal is null and fk_idventa is null)
      or (origen = 'VALE' and tipo = 'EGRESO' and fk_idvales_personal is not null
        and fk_idlavado is null and fk_idgrupo_cliente_creditos is null and fk_idgasto is null and fk_idventa is null)
      or (origen = 'VENTA' and tipo in ('INGRESO', 'EGRESO') and fk_idventa is not null
        and fk_idlavado is null and fk_idgrupo_cliente_creditos is null and fk_idgasto is null and fk_idvales_personal is null)
    );

create index if not exists caja_sesion_movimientos_venta_idx
  on caja_sesion_movimientos (fk_idventa);

create unique index if not exists caja_sesion_movimientos_venta_tipo_unique_idx
  on caja_sesion_movimientos (fk_idventa, tipo)
  where fk_idventa is not null;
