import { arcMethods, createArc, arcPreview, parseCoordinate, validVertices } from './drawing-tools';
import { Point } from './model';

describe('arc construction geometry', () => {
  it('constructs the same quarter-circle independently through all seven methods', () => {
    const input: Point[][] = [
      [
        [10, 0],
        [Math.sqrt(50), Math.sqrt(50)],
        [0, 10],
      ],
      [
        [10, 0],
        [0, 0],
        [0, 10],
      ],
      [
        [10, 0],
        [0, 0],
      ],
      [
        [10, 0],
        [0, 0],
      ],
      [
        [10, 0],
        [0, 10],
      ],
      [
        [10, 0],
        [0, 10],
        [10, 5],
      ],
      [
        [10, 0],
        [0, 10],
      ],
    ];
    const values = [90, 90, 90, Math.sqrt(200), 90, 90, 10];
    arcMethods.forEach((method, index) => {
      const arc = createArc(method, input[index], values[index]);
      expect(arc.points[0][0], method).toBeCloseTo(0, 10);
      expect(arc.points[0][1], method).toBeCloseTo(0, 10);
      expect(arc.radius, method).toBeCloseTo(10, 10);
      expect(Math.min(arc.start_angle, 360 - arc.start_angle), method).toBeCloseTo(0, 10);
      expect(arc.end_angle, method).toBeCloseTo(90, 10);
    });
  });
  it('includes the middle point on major and clockwise three-point arcs', () => {
    const major = createArc('3-Point', [
      [10, 0],
      [0, -10],
      [0, 10],
    ]);
    expect(major.start_angle).toBeCloseTo(90);
    expect(major.end_angle).toBeCloseTo(0);
    expect(arcPreview(major)[48]).toEqual([
      expect.closeTo(-Math.sqrt(50), 8),
      expect.closeTo(-Math.sqrt(50), 8),
    ]);
    const minor = createArc('3-Point', [
      [0, 10],
      [Math.sqrt(50), Math.sqrt(50)],
      [10, 0],
    ]);
    expect(minor.start_angle).toBeCloseTo(0);
    expect(minor.end_angle).toBeCloseTo(90);
  });
  it('handles signed major sweeps and tangent direction rather than a guessed side', () => {
    const major = createArc(
      'Start, End, Angle',
      [
        [10, 0],
        [0, -10],
      ],
      270,
    );
    expect(major.points[0][0]).toBeCloseTo(0);
    expect(major.points[0][1]).toBeCloseTo(0);
    expect(major.end_angle).toBeCloseTo(270);
    const cw = createArc('Start, End, Direction', [
      [10, 0],
      [0, -10],
      [10, -1],
    ]);
    expect(cw.points[0][0]).toBeCloseTo(0);
    expect(cw.points[0][1]).toBeCloseTo(0);
    expect(cw.start_angle).toBeCloseTo(270);
    expect(cw.end_angle).toBeCloseTo(0);
  });
  it('projects center/end input onto the known radius and supports clockwise selection', () => {
    const arc = createArc('Start, Center, End', [
      [10, 0],
      [0, 0],
      [0, 50],
    ]);
    expect(arc.radius).toBe(10);
    expect(arc.end_angle).toBe(90);
    const cw = createArc(
      'Start, Center, Length',
      [
        [10, 0],
        [0, 0],
      ],
      Math.sqrt(200),
      true,
    );
    expect(cw.start_angle).toBeCloseTo(270);
    expect(cw.end_angle).toBeCloseTo(0);
  });
  it('rejects impossible or degenerate input rather than emitting NaN geometry', () => {
    expect(() =>
      createArc('3-Point', [
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    ).toThrow();
    expect(() =>
      createArc('3-Point', [
        [0, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toThrow();
    expect(() =>
      createArc(
        'Start, Center, Length',
        [
          [10, 0],
          [0, 0],
        ],
        21,
      ),
    ).toThrow();
    expect(() =>
      createArc(
        'Start, End, Radius',
        [
          [0, 0],
          [10, 0],
        ],
        4.9,
      ),
    ).toThrow();
    expect(() =>
      createArc('Start, End, Direction', [
        [0, 0],
        [10, 0],
        [1, 0],
      ]),
    ).toThrow();
    for (const value of [0, 360, -360, NaN, Infinity])
      expect(() =>
        createArc(
          'Start, End, Angle',
          [
            [0, 0],
            [10, 0],
          ],
          value,
        ),
      ).toThrow();
  });
  it('handles semicircles, translated coordinates and both radius sides', () => {
    for (const clockwise of [false, true]) {
      const arc = createArc(
        'Start, End, Radius',
        [
          [1e8, 1e8],
          [1e8 + 20, 1e8],
        ],
        10,
        clockwise,
      );
      expect(arc.points[0]).toEqual([1e8 + 10, 1e8]);
      expect(arc.radius).toBe(10);
    }
    const arc = createArc('3-Point', [
      [1e8 + 10, 1e8],
      [1e8, 1e8 + 10],
      [1e8 - 10, 1e8],
    ]);
    expect(arc.points[0]).toEqual([1e8, 1e8]);
  });
});

describe('polyline exact input and segment validation', () => {
  it('supports absolute, relative and polar coordinates without snapping', () => {
    expect(parseCoordinate('1.25, -3.5')).toEqual([1.25, -3.5]);
    expect(parseCoordinate('@2.25, -1', [1, 2])).toEqual([3.25, 1]);
    const point = parseCoordinate('@10<90', [1.25, 2.5]);
    expect(point[0]).toBeCloseTo(1.25, 10);
    expect(point[1]).toBe(12.5);
    for (const text of ['', ',2', 'NaN,2', '1e10,0', '@1,2', '10<90', '@-2<90'])
      expect(() => parseCoordinate(text)).toThrow();
  });
  it('rejects duplicate segments and insufficient closing vertices', () => {
    expect(
      validVertices(
        [
          [0, 0],
          [1, 1],
        ],
        false,
      ),
    ).toBe(true);
    expect(
      validVertices(
        [
          [0, 0],
          [1, 1],
        ],
        true,
      ),
    ).toBe(false);
    expect(
      validVertices(
        [
          [0, 0],
          [1, 1],
          [0, 0],
        ],
        true,
      ),
    ).toBe(false);
    expect(
      validVertices(
        [
          [0, 0],
          [1, 1],
          [1, 1],
        ],
        false,
      ),
    ).toBe(false);
    expect(
      validVertices(
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        true,
      ),
    ).toBe(true);
  });
});
