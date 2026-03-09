# Localizador de medicamentos (Farmatools)

Aplicación web estática para localizar rápidamente medicamentos en guardia (ordenador y móvil), a partir de exportaciones XLS reales de Farmatools.

## Estructura

- `data/raw/` → XLS de origen (`CARRUSELT.xls`, `NEVERAT.xls`, `PEXT.xls`)
- `scripts/build_dataset.py` → pipeline de transformación
- `data/processed/medicamentos.json` → dataset final consumido por la web
- `index.html`, `app.js`, `styles.css` → frontend listo para GitHub Pages
- `docs/dataset_structure.md` → documentación del esquema detectado

## Funcionalidades operativas

- búsqueda tolerante a mayúsculas, acentos, coincidencias parciales y errores leves de escritura (subsecuencia)
- resultados con jerarquía visual enfocada en ubicación: nombre → zona → detalles (celda/posición) → código
- badges claros por zona (`NEVERA`, `CARRUSEL`, `PACIENTES EXTERNOS`)
- botón **Copiar ubicación** en cada tarjeta, con feedback visual breve
- exploración rápida por ubicación con filtros dedicados y limpieza de filtro
- bloque de metadatos del dataset (volumen indexado, fecha visible en cliente y origen)
- integración con CIMA con resolución progresiva por CN a ficha técnica (con fallback seguro por búsqueda)

## Cómo generar el dataset

```bash
python scripts/build_dataset.py
```

Esto genera/actualiza:

- `data/processed/medicamentos.json`

## Ejecutar en local

```bash
python -m http.server 8000
```

Abrir: `http://localhost:8000`

## Publicar en GitHub Pages

1. Sube este repositorio a GitHub.
2. En **Settings → Pages**, selecciona la rama principal y carpeta `/ (root)`.
3. Guarda. GitHub publicará automáticamente la app estática.

## Objetivo operativo

La búsqueda está optimizada para uso real durante turnos de noche:

- búsqueda por código, nombre o ubicación
- filtros rápidos por zona
- respuesta inmediata en cliente (sin backend)
- interfaz clara y táctil en móvil
