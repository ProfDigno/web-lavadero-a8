create table if not exists grupo_cliente_creditos (
  idgrupo_cliente_creditos serial primary key,
  fk_idgrupo_cliente integer not null references grupo_cliente(idgrupo_cliente),
  estado varchar(20) not null default 'ABIERTO',
  fecha_inicio date not null default current_date,
  fecha_fin date,
  fk_idforma_pago integer references formas_pago(idforma_pago),
  pagado_en timestamp,
  fk_idusuario integer references usuarios(idusuario),
  pagado_por varchar(120),
  fecha_creado timestamp not null default now(),
  creado_por varchar(120) not null,
  constraint grupo_cliente_creditos_estado_check check (estado in ('ABIERTO', 'PAGADO'))
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'lavados'
      and column_name = 'fk_idgrupo_cliente_creditos'
  ) then
    alter table lavados add column fk_idgrupo_cliente_creditos integer references grupo_cliente_creditos(idgrupo_cliente_creditos);
  end if;
end $$;

create unique index if not exists grupo_cliente_creditos_un_abierto
  on grupo_cliente_creditos (fk_idgrupo_cliente)
  where estado = 'ABIERTO';

create index if not exists grupo_cliente_creditos_grupo_estado_idx
  on grupo_cliente_creditos (fk_idgrupo_cliente, estado);

create index if not exists lavados_grupo_cliente_credito_idx
  on lavados (fk_idgrupo_cliente_creditos);

insert into grupo_cliente_creditos (fk_idgrupo_cliente, estado, fecha_inicio, creado_por)
select c.fk_idgrupo_cliente, 'ABIERTO', min(l.fecha_creado::date), 'Migracion'
from lavados l
join clientes c on c.idcliente = l.fk_idcliente
join grupo_cliente g on g.idgrupo_cliente = c.fk_idgrupo_cliente
where l.estado = 'CREDITO'
  and l.fk_idgrupo_cliente_creditos is null
  and c.fk_idgrupo_cliente is not null
  and g.es_credito = true
  and not exists (
    select 1
    from grupo_cliente_creditos gcc
    where gcc.fk_idgrupo_cliente = c.fk_idgrupo_cliente
      and gcc.estado = 'ABIERTO'
  )
group by c.fk_idgrupo_cliente;

update lavados l
set fk_idgrupo_cliente_creditos = gcc.idgrupo_cliente_creditos
from clientes c
join grupo_cliente_creditos gcc on gcc.fk_idgrupo_cliente = c.fk_idgrupo_cliente
where c.idcliente = l.fk_idcliente
  and l.estado = 'CREDITO'
  and l.fk_idgrupo_cliente_creditos is null
  and gcc.estado = 'ABIERTO';
