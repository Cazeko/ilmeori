/**
 * PWA 아이콘 만들기.
 *
 *   node scripts/gen-icons.mjs
 *
 * ── 왜 손으로 그리나 ───────────────────────────────────────────────────────
 *
 * SVG 를 PNG 로 굽는 도구(sharp·resvg·puppeteer)는 전부 수십~수백 MB 다.
 * 아이콘 넉 장을 한 번 만들자고 배포에 나가지도 않을 의존성을 늘리지 않는다
 * (HWPX 에서 ZIP 라이브러리를 안 넣은 것과 같은 판단이다).
 *
 * 그릴 것이 사각형과 선분뿐이라 거리함수로 충분하다. 픽셀마다 3×3 으로
 * 훑어(supersampling) 가장자리를 부드럽게 만든다.
 *
 * ── 도형은 BrandMark 와 같은 좌표다 ────────────────────────────────────────
 *
 * `src/components/brand-mark.tsx` 의 path 를 24칸 좌표계 그대로 옮겼다.
 * 홈 화면 아이콘과 화면 왼쪽 위 표식이 다르면 같은 제품으로 안 읽힌다.
 * 한쪽을 고치면 다른 쪽도 고치고, 이 스크립트를 다시 돌린다.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/** 화성특례시 BI 전용색 HS Blue. globals.css 의 --color-primary 와 같은 값. */
const BLUE = [0x00, 0x46, 0x96];
const WHITE = [0xff, 0xff, 0xff];

// ---------------------------------------------------------------------------
// 거리함수 — 24칸 좌표계에서 잰다
// ---------------------------------------------------------------------------

/** 선분까지의 거리. 끝은 둥글다(stroke-linecap="round"와 같다). */
function distSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

/** 모서리가 둥근 사각형까지의 거리. 안쪽이 음수다. */
function distRoundedRect(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

/** BrandMark 의 네 획. 마지막 것은 꺾인 화살촉이라 선분 둘로 나눈다. */
const STROKES = [
  [4.6, 6.4, 15.8, 6.4],
  [4.6, 12, 11.2, 12],
  [4.6, 17.6, 12.6, 17.6],
  [15.2, 13.9, 19.8, 17.6],
  [19.8, 17.6, 15.2, 21.3],
];
const STROKE_HALF = 1.3; // strokeWidth 2.6 의 절반

// ---------------------------------------------------------------------------
// 그리기
// ---------------------------------------------------------------------------

/**
 * @param size    한 변의 픽셀 수
 * @param maskable 홈 화면이 제 모양대로 잘라 가는 아이콘인가.
 *                 참이면 배경이 가장자리까지 꽉 차고, 도형은 안전 영역(80%)
 *                 안으로 들어간다. 거짓이면 배경이 둥근 사각형이고 바깥은 투명.
 */
function draw(size, maskable) {
  const px = new Uint8Array(size * size * 4);
  const SS = 3; // 픽셀 하나를 3×3 으로 훑는다
  // 도형이 놓이는 상자. maskable 은 안전 영역만 쓴다.
  const inset = maskable ? size * 0.2 : size * 0.14;
  const glyphSize = size - inset * 2;
  const scale = glyphSize / 24;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;

          // 배경
          if (maskable) {
            bgHits += 1;
          } else if (
            distRoundedRect(fx, fy, size / 2, size / 2, size / 2, size / 2, size * 0.22) <= 0
          ) {
            bgHits += 1;
          }

          // 도형 — 24칸 좌표로 되돌려 잰다
          const gx = (fx - inset) / scale;
          const gy = (fy - inset) / scale;
          let hit = false;
          for (const [ax, ay, bx, by] of STROKES) {
            if (distSegment(gx, gy, ax, ay, bx, by) <= STROKE_HALF) {
              hit = true;
              break;
            }
          }
          if (hit) fgHits += 1;
        }
      }

      const total = SS * SS;
      const bgA = bgHits / total;
      const fgA = fgHits / total;
      const i = (y * size + x) * 4;

      // 파란 배경 위에 흰 도형을 얹는다. 도형은 배경 밖으로 나가지 않는다.
      const a = bgA;
      const mix = Math.min(fgA, bgA);
      for (let c = 0; c < 3; c += 1) {
        px[i + c] = Math.round(BLUE[c] * (1 - mix) + WHITE[c] * mix);
      }
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

// ---------------------------------------------------------------------------
// PNG 로 굽기 — IHDR · IDAT · IEND 셋이면 된다
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // 색 종류 — RGBA
  // 압축·필터·인터레이스는 전부 0(규격이 정한 유일한 값들이다)

  // 줄마다 필터 바이트 0(None)을 앞에 붙인다.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const FILES = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  // iOS 는 스스로 모서리를 둥글게 깎으므로 꽉 찬 그림을 준다.
  ["apple-touch-icon.png", 180, true],
];

for (const [name, size, maskable] of FILES) {
  const bytes = png(size, draw(size, maskable));
  writeFileSync(join(OUT, name), bytes);
  console.log(`  ${name}  ${size}×${size}  ${(bytes.length / 1024).toFixed(1)}KB`);
}
console.log(
  "\n도형을 고쳤으면 src/components/brand-mark.tsx 와 좌표가 같은지 확인하십시오.",
);
