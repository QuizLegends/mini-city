export function stripePositionsAlongSegment(seg, gap = 7, stripeLen = 3) {
  const list = [];
  const count = Math.floor(seg.length / gap);
  const cos = Math.cos(seg.rotationY);
  const sin = Math.sin(seg.rotationY);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count - 0.5;
    const along = t * seg.length;
    list.push({
      x: seg.x + along * sin,
      z: seg.z + along * cos,
      rotationY: seg.rotationY,
      len: stripeLen,
    });
  }
  return list;
}
