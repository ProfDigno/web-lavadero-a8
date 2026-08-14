with reparto as (
  select l.fecha_creado::date as fecha,
         lp.fk_idpersonal,
         lp.comision,
         floor(round(l.total * 100) / count(*) over (partition by lp.fk_idlavado))
           + case when row_number() over (partition by lp.fk_idlavado order by lp.idlavado_personal) = 1
               then mod(round(l.total * 100), count(*) over (partition by lp.fk_idlavado)) else 0 end as total_servicios_centavos
  from lavados l
  join lavado_personal lp on lp.fk_idlavado = l.idlavado
  where l.estado <> 'ANULADO'
), agregados as (
  select fecha,
         fk_idpersonal,
         count(*)::int as total_lavados_emitidos,
         sum(total_servicios_centavos) / 100.0 as total_servicios,
         sum(comision) as total_comision_40
  from reparto
  group by fecha, fk_idpersonal
)
update comisiones_diarias cd
set total_lavados_emitidos = coalesce(a.total_lavados_emitidos, 0),
    total_servicios = coalesce(a.total_servicios, 0),
    total_comision_40 = coalesce(a.total_comision_40, 0)
from agregados a
where cd.fecha = a.fecha
  and cd.fk_idpersonal = a.fk_idpersonal;

update comisiones_diarias cd
set total_lavados_emitidos = 0,
    total_servicios = 0,
    total_comision_40 = 0
where not exists (
  select 1
  from lavados l
  join lavado_personal lp on lp.fk_idlavado = l.idlavado
  where l.estado <> 'ANULADO'
    and l.fecha_creado::date = cd.fecha
    and lp.fk_idpersonal = cd.fk_idpersonal
);

with reparto as (
  select l.fecha_creado::date as fecha,
         lp.fk_idpersonal,
         lp.comision,
         floor(round(l.total * 100) / count(*) over (partition by lp.fk_idlavado))
           + case when row_number() over (partition by lp.fk_idlavado order by lp.idlavado_personal) = 1
               then mod(round(l.total * 100), count(*) over (partition by lp.fk_idlavado)) else 0 end as total_servicios_centavos
  from lavados l
  join lavado_personal lp on lp.fk_idlavado = l.idlavado
  where l.estado <> 'ANULADO'
), agregados as (
  select fecha,
         fk_idpersonal,
         count(*)::int as total_lavados_emitidos,
         sum(total_servicios_centavos) / 100.0 as total_servicios,
         sum(comision) as total_comision_40
  from reparto
  group by fecha, fk_idpersonal
)
insert into comisiones_diarias
  (fecha, fk_idpersonal, total_lavados_emitidos, total_servicios, total_comision_40, creado_por)
select a.fecha, a.fk_idpersonal, a.total_lavados_emitidos, a.total_servicios, a.total_comision_40, 'MIGRACION 024'
from agregados a
where not exists (
  select 1
  from comisiones_diarias cd
  where cd.fecha = a.fecha
    and cd.fk_idpersonal = a.fk_idpersonal
);
