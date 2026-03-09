# Estructura del dataset Farmatools

Se analizaron las tres exportaciones reales:

- `data/raw/CARRUSELT.xls`
- `data/raw/NEVERAT.xls`
- `data/raw/PEXT.xls`

## Columnas detectadas

### En los tres ficheros

- `codigo` → **código medicamento**.
- `denominaci` → **nombre medicamento** (texto descriptivo del artículo).
- `nom_almacen` → **zona / almacén** (ejemplo: `- Farmacia Valme`).
- `ubica` → **celda / ubicación** (ejemplos: `CARR`, `PEXT`, `NEV`).

> En la muestra actual no aparece ninguna columna de Código Nacional (CN).

### Solo en `NEVERAT.xls`

- `id_estante` → **posición** (posición física/estante dentro de la ubicación).

## Esquema normalizado de salida

El pipeline transforma cada fila al siguiente esquema JSON:

- `codigo` (string)
- `nombre` (string)
- `almacen` (string)
- `ubicacion` (string)
- `posicion` (string, puede venir vacío si no existe en origen)
- `codigo_nacional` (string, vacío si no viene en origen)
- `searchText` (string normalizada en minúsculas y sin tildes para búsqueda rápida)

## Notas operativas

- `CARRUSELT.xls` y `PEXT.xls` no incluyen columna de posición; se completa como cadena vacía.
- Si en futuras exportaciones aparece CN (por ejemplo `codigo_nacional`, `cod_nacional` o `cn`), el pipeline lo incorpora automáticamente a `codigo_nacional`.
- La búsqueda se realiza sobre `searchText`, que concatena: código, código nacional, nombre, almacén, ubicación y posición.
- Se eliminan duplicados por (`codigo`, `nombre`, `ubicacion`, `posicion`) y se conserva `almacen`/`codigo_nacional` más informativos cuando están disponibles.
