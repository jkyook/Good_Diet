/**
 * 음식 region(0~1000) 후처리: IoU·중심 뭉침·보정 롤백
 */
import type { NormalizedBBox } from './parse.js';

export type FoodRegionItem = { name: string; region: NormalizedBBox };

export function bboxIoU(a: NormalizedBBox, b: NormalizedBBox): number {
  const [ay0, ax0, ay1, ax1] = a;
  const [by0, bx0, by1, bx1] = b;
  const iy0 = Math.max(ay0, by0);
  const ix0 = Math.max(ax0, bx0);
  const iy1 = Math.min(ay1, by1);
  const ix1 = Math.min(ax1, bx1);
  if (iy1 <= iy0 || ix1 <= ix0) return 0;
  const inter = (iy1 - iy0) * (ix1 - ix0);
  const areaA = (ay1 - ay0) * (ax1 - ax0);
  const areaB = (by1 - by0) * (bx1 - bx0);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function centroid(region: NormalizedBBox): [number, number] {
  const [y0, x0, y1, x1] = region;
  return [(y0 + y1) / 2, (x0 + x1) / 2];
}

/** 쌍별 IoU 평균 (항목 1개면 0) */
export function meanPairwiseIoU(items: FoodRegionItem[]): number {
  if (items.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      sum += bboxIoU(items[i].region, items[j].region);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/** 중심이 이미지 중앙(0.5,0.5) 근처에 몰려 있는지 — 0~1 */
export function centerClusterScore(items: FoodRegionItem[]): number {
  if (items.length < 2) return 0;
  const cx = items.map(it => centroid(it.region)[1] / 1000);
  const cy = items.map(it => centroid(it.region)[0] / 1000);
  const mx = cx.reduce((a, b) => a + b, 0) / cx.length;
  const my = cy.reduce((a, b) => a + b, 0) / cy.length;
  const spread =
    Math.max(...cx.map(x => Math.abs(x - mx)), ...cy.map(y => Math.abs(y - my)));
  // spread 작을수록 뭉침 (0~0.5)
  return Math.max(0, 0.22 - spread) / 0.22;
}

/**
 * 보정 후 겹침·중앙 뭉침이 악화되면 1차 좌표 유지.
 * 겹침 쌍은 IoU가 더 낮았던 쪽(대개 1차)으로 되돌림.
 */
export function stabilizeFoodRegions(
  before: FoodRegionItem[],
  after: FoodRegionItem[],
): FoodRegionItem[] {
  if (after.length <= 1 || before.length !== after.length) return after;

  const iouBefore = meanPairwiseIoU(before);
  const iouAfter = meanPairwiseIoU(after);
  const clusterBefore = centerClusterScore(before);
  const clusterAfter = centerClusterScore(after);

  if (iouAfter > iouBefore + 0.06 || clusterAfter > clusterBefore + 0.15) {
    console.warn('[foodBbox] 보정 후 겹침/중앙 뭉침 악화 — 1차 감지 좌표 유지', {
      iouBefore,
      iouAfter,
      clusterBefore,
      clusterAfter,
    });
    return before.map((b, i) => ({ name: after[i]?.name ?? b.name, region: b.region }));
  }

  const out = after.map((item, i) => ({ ...item }));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (bboxIoU(out[i].region, out[j].region) <= 0.28) continue;
      const origIoU = bboxIoU(before[i].region, before[j].region);
      const curIoU = bboxIoU(out[i].region, out[j].region);
      if (origIoU < curIoU - 0.05) {
        out[i] = { ...out[i], region: before[i].region };
        out[j] = { ...out[j], region: before[j].region };
      }
    }
  }
  return out;
}
