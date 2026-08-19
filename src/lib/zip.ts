/**
 * ZIP 포장 — HWPX 와 DOCX 가 함께 쓴다.
 *
 * ── 왜 따로 뺐는가 ─────────────────────────────────────────────────────────
 *
 * 원래 이 코드는 `hwpx/pack.ts` 안에 있었다. 「바깥을 하나도 부르지 않는다」는
 * 그 파일의 규칙 때문이었다. 그런데 DOCX 도 결국 같은 ZIP 이다 —
 * 두 벌로 베끼면 한쪽에서 CRC 나 헤더를 고칠 때 다른 쪽이 조용히 남는다.
 * **바이트를 직접 쓰는 코드가 두 벌 있는 것이 import 하나보다 위험하다.**
 *
 * 옮기면서 동작은 한 줄도 바꾸지 않았다. 주석도 함께 옮겼다 — 왜 UTC 로
 * 고정했는지 같은 판단은 코드보다 오래 남아야 한다.
 *
 * ── 의존성 ─────────────────────────────────────────────────────────────────
 *
 * `node:zlib` 말고는 부르는 것이 없다. 필요한 것은 STORED 와 DEFLATE 둘뿐이고
 * 노드에 이미 있다. 의존성 하나가 늘면 그 하나가 내부망 이관 검토 항목이 된다.
 */

import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = {
  name: string;
  data: Uint8Array;
  /** 압축하지 않고 그대로 넣는다. mimetype 은 규격이 그렇게 정한다. */
  store?: boolean;
};

/**
 * DOS 시각.
 *
 * ZIP 은 1980년 이전을 담지 못하고, 초는 2초 단위다. 시간대는 **로컬 시각**으로
 * 적게 되어 있는데, 서버가 UTC 로 돌면 파일 시각이 아홉 시간 어긋난다.
 * 문서에 찍히는 시각은 어차피 본문에 한국 시각으로 들어가므로, 여기서는
 * **어느 서버에서 만들어도 같은 값**이 나오도록 UTC 로 고정한다.
 */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time:
      (d.getUTCHours() << 11) |
      (d.getUTCMinutes() << 5) |
      (Math.floor(d.getUTCSeconds() / 2) & 0x1f),
    date:
      ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function ascii(s: string): Uint8Array {
  // 항목 이름은 전부 ASCII 다(부르는 쪽이 그런 이름만 쓴다).
  // 한글 이름이 섞이면 UTF-8 플래그를 세워야 하므로, 애초에 안 쓴다.
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) throw new Error(`ZIP 항목 이름에 ASCII 밖 글자: ${s}`);
    out[i] = c;
  }
  return out;
}

export function zip(entries: ZipEntry[], modified: Date): Uint8Array {
  const { time, date } = dosDateTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = ascii(entry.name);
    const raw = entry.data;
    const stored = entry.store === true;
    const body = stored ? raw : new Uint8Array(deflateRawSync(raw, { level: 9 }));
    const sum = crc32(raw);

    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // 지역 헤더 서명
    lv.setUint16(4, stored ? 10 : 20, true); // 풀려면 필요한 판
    lv.setUint16(6, 0, true); // 플래그 — 이름이 ASCII 라 0
    lv.setUint16(8, stored ? 0 : 8, true); // 0 = 그대로, 8 = deflate
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra 없음
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // 만든 판
    cv.setUint16(6, stored ? 10 : 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, stored ? 0 : 8, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // 주석
    cv.setUint16(34, 0, true); // 디스크 번호
    cv.setUint16(36, 0, true); // 내부 속성
    cv.setUint32(38, 0, true); // 외부 속성
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total =
    locals.reduce((n, l) => n + l.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
