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

### Solo en `NEVERAT.xls`

- `id_estante` → **posición** (posición física/estante dentro de la ubicación).

## Esquema normalizado de salida

El pipeline transforma cada fila al siguiente esquema JSON:

- `codigo` (string)
- `nombre` (string)
- `almacen` (string)
- `ubicacion` (string)
- `posicion` (string, puede venir vacío si no existe en origen)
- `searchText` (string normalizada en minúsculas y sin tildes para búsqueda rápida)

## Notas operativas

- `CARRUSELT.xls` y `PEXT.xls` no incluyen columna de posición; se completa como cadena vacía.
- La búsqueda se realiza sobre `searchText`, que concatena: código, nombre, almacén, ubicación y posición.
- Se eliminan duplicados exactos (`codigo`, `nombre`, `almacen`, `ubicacion`, `posicion`) durante el build.
