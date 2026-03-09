# Incidencia: búsqueda de TOCILIZUMAB

## Causa raíz

El problema principal estaba en el pipeline de generación del dataset (`scripts/build_dataset.py`):

- El parser BIFF de cadenas compartidas (`_shared_strings`) no manejaba correctamente los registros `CONTINUE` (`0x003C`) del XLS.
- En `NEVERAT.xls`, varias cadenas del SST quedaban truncadas o corruptas a partir de cierto punto.
- Como consecuencia, filas válidas (incluyendo TOCILIZUMAB) se convertían en registros con `codigo` vacío y eran descartadas por `load_rows`.

Efecto observable previo:

- `NEVERAT.xls`: se cargaban 969 filas en lugar de 1252.
- `TOCILIZUMAB` no llegaba a `data/processed/medicamentos.json`.
- La búsqueda de `toci` devolvía coincidencias por subcadena no deseadas (p. ej., CARBETOCINA/OXITOCINA) al no existir TOCILIZUMAB en el dataset.

## Corrección aplicada

### 1) Pipeline

Se reescribió la lectura de SST en `BiffWorkbook` para:

- Iterar registros BIFF de forma explícita.
- Unir correctamente `SST` + `CONTINUE`.
- Respetar cambios de compresión Unicode/8-bit entre fragmentos al reconstruir cadenas.

Resultado tras regenerar dataset:

- `CARRUSELT.xls`: 2949 filas cargadas.
- `NEVERAT.xls`: 1252 filas cargadas.
- `PEXT.xls`: 1158 filas cargadas.
- `data/processed/medicamentos.json`: 942 registros finales.

TOCILIZUMAB queda presente con estos registros:

- `661936` — `TOCILIZUMAB IV vial 200 mg/10 mL` — `NEVERA`
- `702285` — `TOCILIZUMAB SC jer precg 162 mg` — `NEVERA`

### 2) Buscador

En `app.js` se ajustó el filtrado de resultados rankeados:

- Si existen coincidencias por **prefijo de token en nombre**, se priorizan exclusivamente.
- Si no existen, se mantiene fallback por coincidencia de subcadena en nombre.

Con ello, al buscar `toci` se muestran los TOCILIZUMAB y no aparecen CARBETOCINA/OXITOCINA por delante ni en el conjunto final cuando hay coincidencias directas por token.

## Validación final

Se verificó de forma reproducible que:

1. `medicamentos.json` contiene 2 registros de TOCILIZUMAB.
2. Las búsquedas `toci`, `tocili` y `tocilizumab` devuelven exactamente los dos TOCILIZUMAB.
3. En `toci` ya no aparecen CARBETOCINA ni OXITOCINA.
