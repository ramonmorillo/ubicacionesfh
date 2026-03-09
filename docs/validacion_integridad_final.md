# Validación final de integridad del dataset y buscador

## 1) Conteo final en `data/processed/medicamentos.json`

- **Total final de registros:** **942**.

## 2) Comparativa de filas válidas XLS vs dataset final (deduplicado)

Se verificaron las 3 fuentes XLS con el parser actual (`scripts/build_dataset.py`), contando como **fila válida** cada fila con campo `codigo` informado.

| Fuente XLS | Filas válidas leídas |
|---|---:|
| `data/raw/CARRUSELT.xls` | 2949 |
| `data/raw/NEVERAT.xls` | 1252 |
| `data/raw/PEXT.xls` | 1158 |
| **Total antes de deduplicación** | **5359** |

Aplicando la deduplicación del proceso de construcción (`build`) por clave lógica (`codigo`, `nombre`, `ubicacion`, `posicion`):

- **Total tras deduplicación:** **942**
- **Registros duplicados/colapsados:** **4417**

## 3) Total de registros por zona (dataset final)

| Zona | Registros |
|---|---:|
| CARRUSEL | 441 |
| NEVERA | 252 |
| PACIENTES EXTERNOS | 249 |
| **TOTAL** | **942** |

## 4) Ejemplos reales validados (XLS + app)

Se validaron 10 ejemplos reales, comprobando:
1. presencia en los XLS origen,
2. presencia en `data/processed/medicamentos.json`,
3. recuperación correcta mediante búsqueda parcial (misma lógica de búsqueda de la app).

| Zona | Código | Nombre | XLS origen | Búsqueda parcial probada | ¿Recuperado en app? |
|---|---|---|---|---|---|
| NEVERA | 693932 | ABATACEPT jer precg 125 mg | NEVERAT.xls | `abatac` | Sí |
| NEVERA | 954065 | ADALIMUMAB jer precg 40 mg | NEVERAT.xls | `adalim` | Sí |
| NEVERA | 765437 | AFLIBERCEPT jer intraví 8 mg/0,07mL | NEVERAT.xls | `intrav` | Sí |
| CARRUSEL | 998468 | ACETILCISTEINA ANTIDOTO 200 mg/mL vial 25 mL | CARRUSELT.xls | `antidoto` | Sí |
| CARRUSEL | 994970 | ACETILCISTEINA sob 200 mg | CARRUSELT.xls | `sob 200` | Sí |
| CARRUSEL | 984849 | ACETILCOLINA 1% iny 2 mL instilac intraocular | CARRUSELT.xls | `intraoc` | Sí |
| CARRUSEL | 988832 | ACICLOVIR comp 800 mg | CARRUSELT.xls | `aciclo` | Sí |
| PACIENTES EXTERNOS | 723823 | ABEMACICLIB comp 100 mg | PEXT.xls | `abemaci` | Sí |
| PACIENTES EXTERNOS | 713971 | ABIRATERONA comp 500 mg* | PEXT.xls | `abirate` | Sí |
| PACIENTES EXTERNOS | 732471 | ABROCITINIB comp 200 mg | PEXT.xls | `brociti` | Sí |

## 5) Conclusión

- El dataset final `data/processed/medicamentos.json` es **coherente** con la lectura de los 3 XLS tras la corrección del parser.
- El total final (**942**) coincide exactamente con el resultado esperado del pipeline de deduplicación.
- La distribución por zonas es consistente y completa.
- Las búsquedas parciales validadas recuperan correctamente los ejemplos contrastados en las tres zonas (NEVERA, CARRUSEL y PACIENTES EXTERNOS), confirmando **integridad de datos** y **precisión funcional del buscador**.
