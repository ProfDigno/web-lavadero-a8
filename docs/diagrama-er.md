# Diagrama entidad-relación

Este diagrama representa el esquema final de la base de datos después de ejecutar las migraciones hasta `032_column_naming_normalized.sql`.

Las tablas y columnas `legacy` de migraciones anteriores no forman parte del modelo vigente. Las claves foráneas opcionales se identifican en los atributos.

![Diagrama entidad-relación](./diagrama-er.png)

```mermaid
erDiagram
    USUARIOS {
        serial idusuario PK
        varchar login UK
        varchar password_hash
        varchar nombre
        boolean activo
        integer fk_idusuario_roll FK
    }
    USUARIO_ROLL {
        serial idusuario_roll PK
        varchar roll UK
        boolean activo
    }
    USUARIO_ROLL_EVENTO {
        serial idusuario_roll_evento PK
        varchar nombre
        varchar descripcion
        varchar codigo_evento UK
        boolean activo
    }
    USUARIO_ROLL_ITEM {
        serial idusuario_roll_item PK
        integer fk_idusuario_roll FK
        integer fk_idusuario_roll_evento FK
        boolean activo
        string relacion_unica UK
    }
    GRUPO_CLIENTE {
        serial idgrupo_cliente PK
        varchar nombre UK
        boolean es_credito
        boolean activo
    }
    CLIENTES {
        serial idcliente PK
        varchar chapa UK
        varchar marca_modelo
        varchar ruc
        varchar nombre
        varchar email
        integer fk_idgrupo_cliente FK
        boolean activo
    }
    GRUPO_CLIENTE_CREDITOS {
        serial idgrupo_cliente_creditos PK
        integer fk_idgrupo_cliente FK
        varchar estado
        date fecha_inicio
        date fecha_fin
        integer fk_idforma_pago FK
        integer fk_idusuario FK
    }
    SERVICIO_GRUPO {
        serial idservicio_grupo PK
        varchar nombre UK
        varchar imagen
        boolean activo
    }
    SERVICIOS {
        serial idservicio PK
        integer fk_idservicio_grupo FK
        varchar nombre
        numeric precio_base
        boolean activo
    }
    PERSONAL {
        serial idpersonal PK
        varchar nombre
        varchar telefono
        boolean activo
    }
    FORMAS_PAGO {
        serial idforma_pago PK
        varchar nombre UK
        varchar icono_ruta
        varchar color
        boolean activo
    }
    LAVADOS {
        serial idlavado PK
        integer fk_idcliente FK
        varchar condicion
        integer fk_idforma_pago FK
        integer fk_idgrupo_cliente_creditos FK
        varchar estado
        numeric total
        numeric comision_personal
        numeric saldo_lavadero
    }
    LAVADO_SERVICIOS {
        serial idlavado_servicios PK
        integer fk_idlavado FK
        integer fk_idservicio FK
        numeric precio
    }
    LAVADO_PERSONAL {
        serial idlavado_personal PK
        integer fk_idlavado FK
        integer fk_idpersonal FK
        numeric comision
        string relacion_unica UK
    }
    COMISIONES_DIARIAS {
        serial idcomisiones_diarias PK
        date fecha
        integer fk_idpersonal FK
        integer total_lavados_emitidos
        numeric total_servicios
        numeric total_comision_40
        numeric total_vales
        string fecha_personal UK
    }
    VALES_PERSONAL {
        serial idvales_personal PK
        integer fk_idpersonal FK
        date fecha_pago
        numeric monto
        integer fk_idforma_pago FK
        varchar estado
    }
    GASTO_TIPO {
        serial idgasto_tipo PK
        varchar nombre UK
        boolean activo
    }
    GASTOS {
        serial idgasto PK
        integer fk_idgasto_tipo FK
        date fecha_gasto
        varchar descripcion
        numeric monto
        integer fk_idforma_pago FK
        varchar estado
    }
    FACTURAS {
        serial idfactura PK
        varchar numero
        date fecha_emision
        integer fk_idcliente FK
        integer fk_idlavado FK
        varchar cliente_nombre
        varchar cliente_ruc
        varchar tipo_factura
        varchar electronica_estado
        numeric subtotal
        numeric iva_10
        numeric total
        varchar origen
    }
    FACTURA_ITEMS {
        serial idfactura_items PK
        integer fk_idfactura FK
        integer fk_idservicio FK
        varchar descripcion
        numeric cantidad
        numeric precio_unitario
        numeric exenta
        numeric iva_5
        numeric iva_10
        numeric total
    }
    FACTURASEND_CONFIG {
        serial idfacturasend_config PK
        varchar base_url
        varchar tenant
        text api_key_encrypted
        jsonb params
        jsonb ambiente
        boolean activo
    }
    TELEGRAM_AUTORIZACIONES {
        varchar chat_id PK
        varchar nombre_usuario
        varchar nombre_visible
        timestamp autorizado_en
        timestamp ultimo_acceso
        boolean activo
    }

    USUARIO_ROLL ||--o{ USUARIOS : "asigna"
    USUARIO_ROLL ||--o{ USUARIO_ROLL_ITEM : "contiene"
    USUARIO_ROLL_EVENTO ||--o{ USUARIO_ROLL_ITEM : "define"
    GRUPO_CLIENTE ||--o{ CLIENTES : "agrupa"
    GRUPO_CLIENTE ||--o{ GRUPO_CLIENTE_CREDITOS : "administra"
    FORMAS_PAGO ||--o{ GRUPO_CLIENTE_CREDITOS : "cancela"
    USUARIOS ||--o{ GRUPO_CLIENTE_CREDITOS : "registra pago"
    SERVICIO_GRUPO ||--o{ SERVICIOS : "contiene"
    CLIENTES ||--o{ LAVADOS : "solicita"
    FORMAS_PAGO ||--o{ LAVADOS : "cobra"
    GRUPO_CLIENTE_CREDITOS ||--o{ LAVADOS : "incluye"
    LAVADOS ||--o{ LAVADO_SERVICIOS : "detalla"
    SERVICIOS ||--o{ LAVADO_SERVICIOS : "se realiza"
    LAVADOS ||--o{ LAVADO_PERSONAL : "asigna"
    PERSONAL ||--o{ LAVADO_PERSONAL : "trabaja"
    PERSONAL ||--o{ COMISIONES_DIARIAS : "acumula"
    PERSONAL ||--o{ VALES_PERSONAL : "recibe"
    FORMAS_PAGO ||--o{ VALES_PERSONAL : "paga"
    GASTO_TIPO ||--o{ GASTOS : "clasifica"
    FORMAS_PAGO ||--o{ GASTOS : "paga"
    CLIENTES ||--o{ FACTURAS : "figura en"
    LAVADOS ||--o{ FACTURAS : "origina"
    FACTURAS ||--o{ FACTURA_ITEMS : "contiene"
    SERVICIOS ||--o{ FACTURA_ITEMS : "factura"
```

## Convenciones

- `PK`: clave primaria.
- `FK`: clave foránea.
- `UK`: restricción única.
- Las FK que pueden estar vacías son: `clientes.fk_idgrupo_cliente`, `lavados.fk_idgrupo_cliente_creditos`, `facturas.fk_idcliente`, `facturas.fk_idlavado` y `factura_items.fk_idservicio`.
- `FACTURASEND_CONFIG` y `TELEGRAM_AUTORIZACIONES` no tienen relaciones FK con otras tablas en el esquema actual.
