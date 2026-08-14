alter table servicios
  drop constraint if exists servicios_nombre_key;

drop index if exists servicios_grupo_nombre_key;
