# Polyline and Arc tools

Implemented in the existing Angular/Konva DXF editor. Before this change, Arc was
a disabled button: imported arcs could be displayed, edited and exported, but
could not be drawn. No screenshot was attached to this request, and its list ends
at an empty item 8; the seven named methods are implemented below.

## Polyline

Choose **Polyline** beside Line. Left click to place consecutive vertices; moving
the pointer previews the pending segment. The operation stays outside the saved
sketch until completed. Enable **Orthogonal lines / polylines** to track horizontal
or vertical segments from the last vertex. Grid and geometry snapping still apply.

| Action | Result |
|---|---|
| Enter | Finish one open polyline |
| C | Close one polyline, requiring at least three distinct vertices |
| Backspace | Remove the last draft vertex |
| Escape | Cancel the draft and return to selection, including from numeric input |
| Right click | Open Finish, Close, Undo Last Vertex and Cancel actions |

The tool panel also provides buttons for these actions. A repeated closing vertex
is removed when finishing closed; `closed: true` represents the final segment.
Adjacent duplicate vertices are rejected. Open polylines need at least two vertices.
Finished polylines remain single logical entities, with one undo/redo checkpoint.

Use **Exact point** and Enter/Add exact point for numeric placement:

- `12.5,8.25`: absolute model coordinates.
- `@10,-2`: relative Cartesian coordinates from the last draft vertex.
- `@25<30`: distance 25 at 30 degrees from model +X, relative to the last vertex.

Positive angles turn counterclockwise. Relative input requires a first point.
Exact input bypasses snapping and orthogonal tracking. Units are those of the
sketch, not screen pixels; unspecified units remain unspecified.

Select a finished polyline to move vertices using the existing X/Y property
fields. **Add vertex after** inserts a midpoint on the next segment; at an open
end it extends the last segment by half its length. **Remove vertex** removes the
chosen vertex, preserving the entity ID. Edits that introduce zero-length segments
or insufficient closing vertices are rejected without changing history. Edits are
undoable and existing linked annotations synchronize through the usual path.

## Arc

The main **Arc** button reactivates the most recently selected method. The adjacent
arrow opens these exact choices; the preference survives workspace navigation and
reload when browser storage is available. Point-based methods finish on the third
point. Parameter methods take two points followed by a numeric value and **Create
arc**, Enter outside coordinate input, or another canvas click to confirm.

| Method | Inputs and convention |
|---|---|
| 3-Point | Start, a point on the arc, end. The middle point determines minor/major arc and orientation. |
| Start, Center, End | Start, center, end direction. The last point is projected onto the known circle; Clockwise selects direction. |
| Start, Center, Angle | Start, center, signed sweep in degrees. Positive is CCW, negative CW. |
| Start, Center, Length | Start, center, positive **chord length**, at most the diameter. Creates a minor arc; Clockwise selects direction. |
| Start, End, Angle | Start, end, signed sweep in degrees. Supports minor or major sweeps with magnitude strictly between 0 and 360. |
| Start, End, Direction | Start, end, a point along the tangent **leaving the start**. Rejects a tangent parallel to the chord. |
| Start, End, Radius | Start, end, radius at least half the chord length. Creates a minor arc; Clockwise selects the side. |

Exact point input also works for the point stages of arc construction. Live
feedback uses the same geometry calculation as commit. Invalid/collinear points,
impossible radii/chord lengths, zero/full-circle sweeps and non-finite/out-of-range
geometry report an error and preserve the draft so it can be corrected or canceled.
Arcs use the existing native counterclockwise representation. Clockwise input
swaps stored endpoints while preserving the requested geometric locus; no new
arc-direction interpretation is required by DXF or the annotation renderer.

## Native state and interchange

Polyline `points` store model-space vertices, `closed` stores closure, and typed
`segments` store consecutive vertex indices, including the closing segment. Legacy
polylines acquire canonical line-segment records during normalization. Python
validates supplied segment records and rejects inconsistent references. Curved
polyline/bulge segments remain unsupported and are reported by the existing importer.

Entity `revision` starts at 1 and increments for numeric geometry/layer edits and
vertex edits. Stable IDs and revisions survive browser snapshots and T360 DXF
XDATA. Units remain authoritative at sketch level, so reassignment cannot leave
conflicting per-entity unit copies. Drawing revisions continue to be captured by
the existing shared drawing service.

DXF export writes one LWPOLYLINE for each polyline and one ARC for each arc, with
the existing layer/unit handling. Import canonicalizes a repeated DXF closing
vertex. Export rejects zero-length polyline segments and invalid closed vertex
counts; native invalid imported geometry can still be inspected and flagged by the
existing tolerance extractor. Self-intersection/profile manufacturing validation
remains separate from these placement checks.

No kernel, constraint solver, annotation format replacement or duplicate tolerance
engine was introduced. Snaps and orthogonal tracking do not create constraints.
In-progress drafts are canceled on tool changes, replacement drawing loads and
undo/redo. They are not persisted across workspace navigation or reload.

## Verification

Numeric tests independently check a radius-10 quarter circle with all seven
methods, major/CW arcs, tangent direction, translated coordinates and invalid
input. Editor tests exercise polyline completion/closure, exact coordinates,
orthogonal tracking, context actions, cancellation, previews, vertex edits,
stable IDs/revisions, undo/redo and browser persistence. API tests reopen and audit
exported DXF and check native IDs, revisions, units, layers, closure and segments.
The full frontend/backend suites and production build are run for this change.
Real-browser pointer/visual checks and external CAD viewer comparisons remain
unverified.
