"""Generate the uploadable flange example from the supplied drawing crop.

Run from the repository root:
    PYTHONPATH=backend .venv/bin/python examples/dxf/generate_reference_flange.py
"""
import math
from pathlib import Path

import ezdxf

from app.dxf.models import Annotation, Entity, Placement, Sketch, Tolerance
from app.dxf.service import read_dxf, write_dxf


def generate():
    entities = [
        Entity(id='flange-outer', type='circle', layer='Geometry', points=[(0, 0)], radius=49.75),
        Entity(id='flange-shoulder', type='circle', layer='Geometry', points=[(0, 0)], radius=28.55),
    ]
    for i in range(8):
        angle = math.radians(i * 45)
        center = (43 * math.cos(angle), 43 * math.sin(angle))
        entities.append(Entity(id=f'bolt-hole-{i+1}', type='circle', layer='Geometry', points=[center], radius=4))

    # These inner features are illustrative because their sizes are not readable.
    for diameter in (20, 32, 36, 39):
        entities.append(Entity(id=f'assumed-inner-d{diameter}', type='circle',
                               layer='Reference - assumed', points=[(0, 0)], radius=diameter/2))

    # Explicit short arcs/lines preserve a dashed appearance in T360, whose
    # current renderer does not reproduce per-entity DXF dash styles.
    for i in range(36):
        entities.append(Entity(id=f'pitch-dash-{i+1}', type='arc', layer='Construction',
                               points=[(0, 0)], radius=43, start_angle=i*10, end_angle=i*10+6))
    for axis in (0, 1):
        for i in range(19):
            a, b = [0.0, 0.0], [0.0, 0.0]
            a[axis], b[axis] = -56 + i*6, -52 + i*6
            entities.append(Entity(id=f'axis-{axis}-dash-{i+1}', type='line', layer='Construction', points=[a, b]))

    # Hidden analytic pitch circle gives its dimension a real geometry reference.
    entities.append(Entity(id='pitch-circle-reference', type='circle', layer='Pitch reference', points=[(0, 0)], radius=43))

    def diameter_annotation(entity_id, value, position, tolerance=None):
        return Annotation(id=f'dimension-{entity_id}', type='diameter', refs=[entity_id],
                          measured_value=value, units='mm', precision=2, tolerance=tolerance,
                          placement=Placement(position=position, manual=True), mode='manual')

    sketch = Sketch(
        drawing_id='reference-flange-example', units='mm', entities=entities,
        hidden_layers=['Pitch reference'],
        annotations=[
            diameter_annotation('flange-outer', 99.5, (0, -70), Tolerance(plus=0.5, minus=0.5)),
            diameter_annotation('flange-shoulder', 57.1, (0, -59), Tolerance(plus=0.5, minus=0.5)),
            diameter_annotation('pitch-circle-reference', 86, (63, 29)),
            diameter_annotation('bolt-hole-2', 8, (64, 52), Tolerance(plus=0.1, minus=0.1)),
        ],
    )
    target = Path(__file__).with_name('reference-flange.dxf')
    target.write_text(write_dxf(sketch.model_dump()), encoding='utf-8')

    doc = ezdxf.readfile(target)
    assert not doc.audit().has_errors
    restored = Sketch.model_validate(read_dxf(target.read_text()))
    assert restored.units == 'mm'
    assert len(restored.entities) == len(sketch.entities)
    assert len(restored.annotations) == 4
    holes = [e for e in restored.entities if e.id.startswith('bolt-hole-')]
    assert len(holes) == 8
    assert all(math.isclose(math.hypot(*e.points[0]), 43) and e.radius == 4 for e in holes)
    assert {e.id for e in restored.entities} == {e.id for e in sketch.entities}
    print(f'Created {target}: {len(restored.entities)} entities, 4 linked dimensions, validated DXF import.')


if __name__ == '__main__':
    generate()
