#!/usr/bin/env python3
from __future__ import annotations

import json
import struct
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

RAW_FILES = [
    Path('data/raw/CARRUSELT.xls'),
    Path('data/raw/NEVERAT.xls'),
    Path('data/raw/PEXT.xls'),
]
OUTPUT_FILE = Path('data/processed/medicamentos.json')
ZONE_LABELS = {
    'NEV': 'NEVERA',
    'CARR': 'CARRUSEL',
    'PEXT': 'PACIENTES EXTERNOS',
}


@dataclass
class DirectoryEntry:
    name: str
    entry_type: int
    start_sector: int
    size: int


class OleFile:
    FREE = 0xFFFFFFFF
    END = 0xFFFFFFFE

    def __init__(self, data: bytes):
        self.data = data
        h = data[:512]
        if h[:8] != b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
            raise ValueError('Invalid OLE file signature')
        self.sector_size = 1 << struct.unpack_from('<H', h, 30)[0]
        self.mini_sector_size = 1 << struct.unpack_from('<H', h, 32)[0]
        self.dir_start_sector = struct.unpack_from('<I', h, 48)[0]
        self.mini_stream_cutoff = struct.unpack_from('<I', h, 56)[0]
        self.mini_fat_start = struct.unpack_from('<I', h, 60)[0]
        self.num_mini_fat_sectors = struct.unpack_from('<I', h, 64)[0]
        self.difat_start = struct.unpack_from('<I', h, 68)[0]
        self.num_difat_sectors = struct.unpack_from('<I', h, 72)[0]

        difat = list(struct.unpack_from('<109I', h, 76))
        s = self.difat_start
        for _ in range(self.num_difat_sectors):
            if s in (self.FREE, self.END):
                break
            off = 512 + s * self.sector_size
            difat.extend(struct.unpack_from(f'<{(self.sector_size // 4) - 1}I', data, off))
            s = struct.unpack_from('<I', data, off + self.sector_size - 4)[0]

        self.fat = []
        for fs in difat:
            if fs in (self.FREE, self.END):
                continue
            off = 512 + fs * self.sector_size
            self.fat.extend(struct.unpack_from(f'<{self.sector_size // 4}I', data, off))

        dir_stream = self._read_big_stream(self.dir_start_sector, None)
        self.directory = []
        for i in range(0, len(dir_stream), 128):
            e = dir_stream[i : i + 128]
            if len(e) < 128:
                break
            nlen = struct.unpack_from('<H', e, 64)[0]
            name = e[: max(0, nlen - 2)].decode('utf-16le', errors='ignore')
            et = e[66]
            ss = struct.unpack_from('<I', e, 116)[0]
            size = struct.unpack_from('<Q', e, 120)[0]
            self.directory.append(DirectoryEntry(name, et, ss, int(size)))

        root = self.directory[0]
        self.ministream = self._read_big_stream(root.start_sector, root.size)
        self.mini_fat = []
        s = self.mini_fat_start
        for _ in range(self.num_mini_fat_sectors):
            if s in (self.FREE, self.END):
                break
            off = 512 + s * self.sector_size
            self.mini_fat.extend(struct.unpack_from(f'<{self.sector_size // 4}I', data, off))
            s = self.fat[s]

    def _read_chain(self, start: int, fat: List[int], ss: int, blob: bytes, base: int) -> bytes:
        out = bytearray()
        s = start
        c = 0
        while s not in (self.FREE, self.END) and s < len(fat):
            off = (base + s * ss) if blob is self.data else s * ss
            out.extend(blob[off : off + ss])
            s = fat[s]
            c += 1
            if c > 100000:
                raise RuntimeError('OLE chain corrupted')
        return bytes(out)

    def _read_big_stream(self, start: int, size: int | None) -> bytes:
        b = self._read_chain(start, self.fat, self.sector_size, self.data, 512)
        return b if size is None else b[:size]

    def read_stream(self, name: str) -> bytes:
        for e in self.directory:
            if e.name != name:
                continue
            if e.size < self.mini_stream_cutoff and e.entry_type == 2:
                b = self._read_chain(
                    e.start_sector, self.mini_fat, self.mini_sector_size, self.ministream, 0
                )
                return b[: e.size]
            return self._read_big_stream(e.start_sector, e.size)
        raise KeyError(name)


class BiffWorkbook:
    def __init__(self, data: bytes):
        self.data = data

    def sheets(self) -> List[Tuple[str, int]]:
        out = []
        p = 0
        while p + 4 <= len(self.data):
            t, l = struct.unpack_from('<HH', self.data, p)
            p += 4
            r = self.data[p : p + l]
            p += l
            if t != 0x0085:
                continue
            bof = struct.unpack_from('<I', r, 0)[0]
            cch = r[6]
            flags = r[7]
            uni = flags & 1
            name = (
                r[8 : 8 + 2 * cch].decode('utf-16le', errors='ignore')
                if uni
                else r[8 : 8 + cch].decode('latin1', errors='ignore')
            )
            out.append((name, bof))
        return out

    def _iter_records(self) -> Iterable[Tuple[int, bytes]]:
        p = 0
        while p + 4 <= len(self.data):
            t, l = struct.unpack_from('<HH', self.data, p)
            p += 4
            r = self.data[p : p + l]
            p += l
            yield t, r

    def _shared_strings(self) -> List[str]:
        records = list(self._iter_records())
        sst = []

        for idx, (rtype, rec) in enumerate(records):
            if rtype != 0x00FC:
                continue

            fragments = [rec]
            j = idx + 1
            while j < len(records) and records[j][0] == 0x003C:
                fragments.append(records[j][1])
                j += 1

            if len(rec) < 8:
                continue

            uniq = struct.unpack_from('<I', rec, 4)[0]
            frag_i, frag_off = 0, 8

            def read_raw(n: int) -> bytes:
                nonlocal frag_i, frag_off
                out = bytearray()
                while n > 0 and frag_i < len(fragments):
                    frag = fragments[frag_i]
                    avail = len(frag) - frag_off
                    if avail <= 0:
                        frag_i += 1
                        frag_off = 0
                        continue
                    take = min(n, avail)
                    out.extend(frag[frag_off : frag_off + take])
                    frag_off += take
                    n -= take
                return bytes(out)

            def read_char_data(cch: int, initial_unicode: bool) -> str:
                nonlocal frag_i, frag_off
                chars: List[str] = []
                unicode_mode = bool(initial_unicode)

                while len(chars) < cch and frag_i < len(fragments):
                    frag = fragments[frag_i]
                    if frag_off >= len(frag):
                        frag_i += 1
                        frag_off = 0
                        if frag_i >= len(fragments):
                            break
                        mode = read_raw(1)
                        if not mode:
                            break
                        unicode_mode = bool(mode[0] & 0x01)
                        continue

                    if unicode_mode:
                        chunk = read_raw(2)
                        if len(chunk) < 2:
                            break
                        chars.append(chunk.decode('utf-16le', errors='ignore'))
                    else:
                        chunk = read_raw(1)
                        if len(chunk) < 1:
                            break
                        chars.append(chunk.decode('latin1', errors='ignore'))

                return ''.join(chars)

            while len(sst) < uniq:
                head = read_raw(3)
                if len(head) < 3:
                    break
                cch = struct.unpack_from('<H', head, 0)[0]
                flags = head[2]
                uni = flags & 1
                rich = flags & 0x08
                ext = flags & 0x04

                rr = struct.unpack('<H', read_raw(2))[0] if rich else 0
                ex = struct.unpack('<I', read_raw(4))[0] if ext else 0
                sst.append(read_char_data(cch, bool(uni)))

                if rr:
                    read_raw(rr * 4)
                if ex:
                    read_raw(ex)

            break

        return sst

    def parse_sheet_rows(self, bof: int) -> List[List[str]]:
        sst = self._shared_strings()
        cells = {}
        p = bof
        while p + 4 <= len(self.data):
            t, l = struct.unpack_from('<HH', self.data, p)
            p += 4
            r = self.data[p : p + l]
            p += l
            if t == 0x000A:
                break
            if t == 0x00FD:
                row, col = struct.unpack_from('<HH', r, 0)
                idx = struct.unpack_from('<I', r, 6)[0]
                cells[(row, col)] = sst[idx] if idx < len(sst) else ''
            elif t == 0x0204:
                row, col = struct.unpack_from('<HH', r, 0)
                n = struct.unpack_from('<H', r, 6)[0]
                cells[(row, col)] = r[8 : 8 + n].decode('latin1', errors='ignore')
            elif t == 0x0203:
                row, col = struct.unpack_from('<HH', r, 0)
                v = struct.unpack_from('<d', r, 6)[0]
                cells[(row, col)] = str(int(v) if v.is_integer() else v)

        if not cells:
            return []
        mr = max(k[0] for k in cells)
        mc = max(k[1] for k in cells)
        return [[cells.get((r, c), '') for c in range(mc + 1)] for r in range(mr + 1)]


def norm(t: str) -> str:
    t = unicodedata.normalize('NFKD', t)
    t = ''.join(ch for ch in t if not unicodedata.combining(ch))
    return ' '.join(t.lower().split())


def clean_value(value: str) -> str:
    cleaned = ' '.join((value or '').replace('\xa0', ' ').split()).strip()
    if cleaned.startswith('- '):
        cleaned = cleaned[2:].strip()
    return cleaned


def normalize_zone(zone: str) -> str:
    z = clean_value(zone).upper()
    return ZONE_LABELS.get(z, z)


def load_rows(path: Path) -> List[Dict[str, str]]:
    ole = OleFile(path.read_bytes())
    sname = 'Workbook' if any(e.name == 'Workbook' for e in ole.directory) else 'Book'
    wb = BiffWorkbook(ole.read_stream(sname))
    _, bof = wb.sheets()[0]
    rows = wb.parse_sheet_rows(bof)
    headers = [norm(h).replace(' ', '_') for h in rows[0]]
    out = []
    for row in rows[1:]:
        vals = row + [''] * (len(headers) - len(row))
        rec = {headers[i]: clean_value(vals[i] or '') for i in range(len(headers))}
        if rec.get('codigo'):
            out.append(rec)
    print(f'Loaded {len(out)} from {path.name}')
    return out


def extract_cn(record: Dict[str, str]) -> str:
    cn_fields = [
        'codigo',
        'codigo_nacional',
        'cod_nacional',
        'cn',
        'codigo_nac',
        'codigo_nacional_completo',
    ]
    for field in cn_fields:
        digits = ''.join(ch for ch in clean_value(record.get(field, '')) if ch.isdigit())
        if 6 <= len(digits) <= 8:
            return digits
    return ''


def build(records: Iterable[Dict[str, str]]) -> List[Dict[str, str]]:
    by_core_key: Dict[Tuple[str, str, str, str], Dict[str, str]] = {}

    for r in records:
        codigo = clean_value(r.get('codigo', ''))
        nombre = clean_value(r.get('denominaci', r.get('nombre', '')))
        almacen = clean_value(r.get('nom_almacen', r.get('almacen', '')))
        ubicacion = normalize_zone(r.get('ubica', r.get('ubicacion', '')))
        posicion = clean_value(r.get('id_estante', r.get('posicion', '')))

        codigo_nacional = extract_cn(r)

        core_key = (codigo, nombre, ubicacion, posicion)
        candidate = {
            'codigo': codigo,
            'nombre': nombre,
            'almacen': almacen,
            'ubicacion': ubicacion,
            'posicion': posicion,
            'codigo_nacional': codigo_nacional,
        }

        existing = by_core_key.get(core_key)
        if not existing:
            by_core_key[core_key] = candidate
            continue

        if not existing.get('almacen') and candidate.get('almacen'):
            by_core_key[core_key] = candidate
            continue

        if not existing.get('codigo_nacional') and candidate.get('codigo_nacional'):
            existing['codigo_nacional'] = candidate['codigo_nacional']

    out = []
    for row in by_core_key.values():
        row['searchText'] = norm(' '.join([
            row['codigo'],
            row['codigo_nacional'],
            row['nombre'],
            row['almacen'],
            row['ubicacion'],
            row['posicion'],
        ]))
        out.append(row)

    out.sort(key=lambda x: (x['nombre'], x['codigo']))
    return out


def main() -> None:
    recs = []
    for p in RAW_FILES:
        recs.extend(load_rows(p))
    data = build(recs)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(data)} records to {OUTPUT_FILE}')


if __name__ == '__main__':
    main()
