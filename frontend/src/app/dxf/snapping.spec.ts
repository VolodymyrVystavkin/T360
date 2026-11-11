import { newEntity, Point } from './model';
import { findSnap, orthogonalPoint } from './snapping';

describe('precision snapping in model coordinates', () => {
  it('uses the same pixel capture radius across zoom levels', () => {
    const line = newEntity('line', [
      [10.25, 20.75],
      [100, 50],
    ]);
    for (const zoom of [0.1, 1, 50, 200]) {
      const pointer: Point = [10.25 - 7 / zoom, 20.75];
      expect(findSnap(pointer, [line], zoom, 8, ['endpoint'])?.point).toEqual([10.25, 20.75]);
      expect(findSnap([10.25 - 9 / zoom, 20.75], [line], zoom, 8, ['endpoint'])).toBeNull();
    }
  });
  it('uses explicit priority before distance and allows disabling snap kinds', () => {
    const line = newEntity('line', [
      [0.25, 0.25],
      [20, 0.25],
    ]);
    expect(findSnap([0, 0], [line], 4)?.kind).toBe('endpoint');
    expect(findSnap([0, 0], [line], 4, 8, ['grid', 'endpoint'])?.kind).toBe('grid');
    expect(findSnap([0, 0], [line], 4, 8, [])).toBeNull();
  });
  it('includes closed polyline closing segments and clamps nearest points', () => {
    const polyline = newEntity('polyline', [
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    polyline.closed = true;
    expect(findSnap([5.1, 5], [polyline], 10, 8, ['midpoint'])?.point).toEqual([5, 5]);
    const line = newEntity('line', [
      [0, 0],
      [10, 0],
    ]);
    expect(findSnap([11, 1], [line], 1, 2, ['nearest'])?.point).toEqual([10, 0]);
    expect(findSnap([4, 1], [line], 1, 2, ['nearest'])?.point).toEqual([4, 0]);
  });
  it('respects wrapped arc sweeps for quadrants and nearest points', () => {
    const arc = newEntity('arc', [[0, 0]], 10);
    arc.start_angle = 300;
    arc.end_angle = 60;
    expect(findSnap([10.1, 0], [arc], 10, 8, ['quadrant'])?.point).toEqual([10, 0]);
    expect(findSnap([-10, 0], [arc], 10, 8, ['quadrant', 'nearest'])).toBeNull();
    expect(findSnap([5, -8.66], [arc], 10, 8, ['endpoint'])?.kind).toBe('endpoint');
  });
  it('finds centers and exact radial projections without mutating geometry', () => {
    const circle = newEntity('circle', [[2, 3]], 5);
    const before = JSON.stringify(circle);
    expect(findSnap([2.1, 3.1], [circle], 10, 8, ['center'])?.point).toEqual([2, 3]);
    const point = findSnap([5.1, 7.1], [circle], 1, 8, ['nearest'])!.point;
    expect(Math.hypot(point[0] - 2, point[1] - 3)).toBeCloseTo(5, 12);
    expect((point[0] - 2) * 4.1 - (point[1] - 3) * 3.1).toBeCloseTo(0, 12);
    expect(JSON.stringify(circle)).toBe(before);
  });
  it('rejects invalid transforms and handles zero-length segments', () => {
    const line = newEntity('line', [
      [1, 1],
      [1, 1],
    ]);
    expect(findSnap([1, 1], [line], 1, 8, ['nearest'])).toBeNull();
    expect(findSnap([0, 0], [], 0)).toBeNull();
    expect(findSnap([0, 0], [], 1, NaN)).toBeNull();
  });
  it('projects orthogonally without rounding fractional model coordinates', () => {
    expect(orthogonalPoint([1.25, 2.5], [9.75, 3])).toEqual([9.75, 2.5]);
    expect(orthogonalPoint([1.25, 2.5], [2, 10.75])).toEqual([1.25, 10.75]);
  });
});
