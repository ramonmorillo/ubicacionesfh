# Auditoría específica de deduplicación

## 1) Clave exacta de deduplicación usada en `scripts/build_dataset.py`

La deduplicación **no** usa un único campo; usa una **combinación exacta de 4 campos** (`core_key`):

- `codigo`
- `nombre`
- `ubicacion`
- `posicion`

El campo `codigo_nacional` **no forma parte de la clave** de deduplicación. Se calcula aparte y solo se usa para enriquecer el registro final si faltaba.

## 2) Lógica exacta de deduplicación (código/pseudocódigo)

Código relevante (resumen fiel):

```python
for r in records:
    codigo = clean_value(r['codigo'])
    nombre = clean_value(r['denominaci'] or r['nombre'])
    ubicacion = normalize_zone(r['ubica'] or r['ubicacion'])
    posicion = clean_value(r['id_estante'] or r['posicion'])
    almacen = clean_value(r['nom_almacen'] or r['almacen'])
    codigo_nacional = extract_cn(r)

    core_key = (codigo, nombre, ubicacion, posicion)

    if core_key no existe:
        guardar candidate
    else:
        # misma clave => duplicado
        # preferir fila con almacen informado
        if existing.almacen vacío y candidate.almacen no vacío:
            reemplazar existing por candidate
        # completar CN solo si faltaba
        if existing.codigo_nacional vacío y candidate.codigo_nacional no vacío:
            existing.codigo_nacional = candidate.codigo_nacional
```

Conclusión técnica: dos filas se fusionan **solo** si coinciden exactamente en `(codigo, nombre, ubicacion, posicion)`.

## 3) Ejemplos reales

Se cargaron 5359 filas brutas y quedaron 942 registros finales (colapso de 4417). Los siguientes ejemplos provienen de los XLS crudos.

### 3.1 Cinco casos que se colapsan correctamente

Todos estos casos repiten la misma clave `(codigo, nombre, ubicacion, posicion)` y varían solo en `almacen`.

| Caso | Clave deduplicada | Nº filas XLS | Evidencia de variación |
|---|---|---:|---|
| 1 | (`758706`, `ACETILCISTEINA iny 300 mg/3 mL`, `CARRUSEL`, ``) | 7 | `almacen`: Farmacia Valme, Almacenes APD, Almacenes OMNICELL, Botiquin Tomillar, Hospital de Lebrija, ... |
| 2 | (`994970`, `ACETILCISTEINA sob 200 mg`, `CARRUSEL`, ``) | 7 | mismo medicamento replicado por almacén |
| 3 | (`984849`, `ACETILCOLINA 1% iny 2 mL instilac intraocular`, `CARRUSEL`, ``) | 7 | mismo patrón por almacén |
| 4 | (`601104`, `ACETILSALICILATO DE LISINA iny 500 mg`, `CARRUSEL`, ``) | 7 | mismo patrón por almacén |
| 5 | (`988832`, `ACICLOVIR comp 800 mg`, `CARRUSEL`, ``) | 7 | mismo patrón por almacén |

### 3.2 Cinco casos que se conservan como distintos (sin fusión indebida)

| Caso | Registros que se conservan separados | Motivo por el que NO se fusionan |
|---|---|---|
| 1 | `ARIPIPRAZOL iny 300 mg` (`701735`) vs `ARIPIPRAZOL iny 400 mg` (`701736`) | distinto `codigo` y distinto `nombre` (presentaciones distintas) |
| 2 | `ENOXAPARINA jer 4.000 UI/0,4 mL` (`639492`) vs `ENOXAPARINA jer 8.000 UI/0,8 mL` (`875195`) | distinta presentación/dosis y distinto `codigo` |
| 3 | `BUPRENORFINA 8 mg` (`725934`) vs `BUPRENORFINA 128 mg` (`725941`) | misma familia, distinta presentación y código |
| 4 | `OFATUMUMAB 20 mg pluma precg` (`665813`) en `CARRUSEL` y en `NEVERA` | mismo nombre y código, pero **distinta `ubicacion`** |
| 5 | `RAMIPRIL comp 2,5 mg` (`643304`) en `CARRUSEL` y en `PACIENTES EXTERNOS` | mismo nombre y código, pero **distinta `ubicacion`** |

## 4) Verificación explícita de no-fusión incorrecta

### a) Distintas presentaciones del mismo medicamento

Verificado: se mantienen separadas porque cambian `codigo` y/o `nombre` (ej.: familias ARIPIPRAZOL, ENOXAPARINA, BUPRENORFINA).

### b) Mismo medicamento en distinta zona

Verificado: se mantienen separadas por incluir `ubicacion` en la clave (ej.: OFATUMUMAB y RAMIPRIL en zonas distintas).

### c) Mismo nombre con distinto código

Regla: **no se fusiona** porque `codigo` está en la clave.

Hallazgo en estos XLS: no aparecen casos de `nombre` idéntico con `codigo` distinto tras normalización de texto; sí hay muchos nombres muy parecidos con códigos distintos, y permanecen separados.

### d) Registros con distinta posición o celda

Regla: **no se fusiona** porque `posicion` está en la clave.

Hallazgo en estos XLS: `posicion`/`id_estante` viene vacío en todas las filas analizadas (0 filas con posición no vacía). Por tanto, no hay casos reales en este lote para observar separación por posición, aunque el criterio está implementado correctamente.

## 5) Conclusión sobre seguridad/riesgo de la deduplicación actual

- **Seguro para este dataset** respecto a los riesgos pedidos: la deduplicación exige coincidencia exacta de `(codigo, nombre, ubicacion, posicion)` y no mezcla presentaciones distintas ni zonas distintas.
- **Riesgo residual funcional**: como `posicion` llega siempre vacía en este lote, hoy no aporta granularidad real (aunque sí está contemplada). Si en el futuro se llena ese campo, la lógica ya está preparada para separar por posición.
- **Riesgo de calidad de origen**: `codigo_nacional` no decide deduplicación; solo complementa. Si hubiera códigos erróneos en origen pero con misma clave de 4 campos, se colapsarán igualmente (comportamiento actual intencional).
