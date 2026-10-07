"""Author the fixed-pose studio sample, without photographs or external models.
Run with scripts/modelled-requirements.txt installed. Dimensions are metres-like
art units, not a fitting calibration. Browser runtime never executes this script.
"""
from pathlib import Path
import numpy as np
from scipy.interpolate import PchipInterpolator
from skimage.measure import marching_cubes
import trimesh

ROOT = Path(__file__).resolve().parents[1]
SCENE = trimesh.Scene()
for name in ['mannequin', 'white-shirt', 'barrel-jeans']:
    SCENE.graph.update(frame_to=name, frame_from=SCENE.graph.base_frame)


def mat(name, rgb, roughness=0.9, metal=0):
    # glTF baseColorFactor is linear, whereas these authoring swatches are sRGB.
    c = np.array(rgb, dtype=float) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return trimesh.visual.material.PBRMaterial(name=name, baseColorFactor=np.r_[c, 1],
        roughnessFactor=roughness, metallicFactor=metal, doubleSided=True)

SKIN = mat('warm matte mannequin', [218, 201, 182])
CLOTH = mat('ivory linen', [242, 241, 234])
DENIM = mat('charcoal denim', [56, 59, 61])
STITCH = mat('subtle denim stitching', [125, 117, 101])
BUTTON = mat('ivory buttons', [218, 218, 209], 0.65)
METAL = mat('jean button', [123, 116, 94], 0.48, 0.5)


def add(mesh, name, parent, material):
    mesh.visual = trimesh.visual.TextureVisuals(material=material)
    SCENE.add_geometry(mesh, node_name=name, geom_name=name, parent_node_name=parent)


def smooth_min(a, b, k=0.025):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def ellipsoid(q, centre, radii):
    return (np.sqrt(np.sum(((q - centre) / radii) ** 2, axis=-1)) - 1) * min(radii)


def capsule(q, a, b, ra, rb):
    a, b = np.array(a), np.array(b)
    v = b - a
    t = np.clip(np.sum((q - a) * v, axis=-1) / np.dot(v, v), 0, 1)
    return np.linalg.norm(q - a - t[..., None] * v, axis=-1) - (ra + (rb - ra) * t)


def profile(q, rows, power=2):
    rows = np.array(rows)
    y = np.clip(q[..., 1], rows[0, 0], rows[-1, 0])
    rx = PchipInterpolator(rows[:, 0], rows[:, 1])(y)
    rz = PchipInterpolator(rows[:, 0], rows[:, 2])(y)
    radial = ((np.abs(q[..., 0] / rx) ** power + np.abs(q[..., 2] / rz) ** power) ** (1 / power) - 1) * np.minimum(rx, rz)
    return np.maximum(radial, np.maximum(rows[0, 0] - q[..., 1], q[..., 1] - rows[-1, 0]))


def field_mesh(function, bounds, step, target):
    axes = [np.arange(lo, hi + step, step, dtype=np.float32) for lo, hi in bounds]
    grid = np.stack(np.meshgrid(*axes, indexing='ij'), axis=-1)
    field = function(grid).astype(np.float32)
    vertices, faces, _, _ = marching_cubes(field, 0, spacing=(step,) * 3)
    vertices += np.array([axis[0] for axis in axes])
    mesh = trimesh.Trimesh(vertices, faces, process=True)
    mesh.fix_normals()
    if len(mesh.faces) > target:
        mesh = mesh.simplify_quadric_decimation(face_count=target, aggression=4)
    mesh.fix_normals()
    return mesh


def body(q):
    f = profile(q, [[.80, .16, .08], [.88, .225, .118], [.94, .235, .123],
        [1.05, .17, .093], [1.16, .185, .105], [1.29, .222, .124],
        [1.36, .225, .112], [1.405, .16, .08], [1.45, .065, .056]])
    f = smooth_min(f, capsule(q, [0, 1.425, 0], [0, 1.57, 0], .058, .052), .028)
    f = smooth_min(f, ellipsoid(q, [0, 1.67, 0], [.12, .17, .112]), .025)
    for side in [-1, 1]:
        shoulder = [side * .215, 1.355, 0]
        elbow = [side * .322, 1.18, .009]
        wrist = [side * .370, .997, .018]
        f = smooth_min(f, capsule(q, shoulder, elbow, .047, .041), .04)
        f = smooth_min(f, capsule(q, elbow, wrist, .041, .026), .024)
        f = smooth_min(f, ellipsoid(q, [side * .372, .958, .019], [.03, .043, .019]), .013)
        for dx, length in [(-.021, .032), (-.007, .044), (.008, .041), (.021, .03)]:
            a = [side * (.372 + dx), .931, .023]
            b = [side * (.372 + dx * 1.13), .931 - length, .032]
            f = smooth_min(f, capsule(q, a, b, .0075, .0065), .007)
        f = smooth_min(f, capsule(q, [side * .351, .975, .02], [side * .329, .944, .039], .011, .009), .012)
        f = smooth_min(f, capsule(q, [side * .115, .855, 0], [side * .112, .48, .008], .115, .064), .028)
        f = smooth_min(f, capsule(q, [side * .112, .48, .008], [side * .106, .29, .007], .064, .069), .025)
        f = smooth_min(f, capsule(q, [side * .106, .29, .007], [side * .104, .09, .008], .069, .034), .022)
        f = smooth_min(f, ellipsoid(q, [side * .104, .044, .045], [.045, .038, .09]), .017)
        for dx, length in [(-.031, .037), (-.015, .041), (.001, .04), (.017, .036), (.03, .028)]:
            f = smooth_min(f, capsule(q, [side * (.104 + dx), .033, .105],
                [side * (.104 + dx), .027, .105 + length], .01, .008), .007)
    return f


print('Sculpting continuous mannequin…', flush=True)
add(field_mesh(body, [(-.435, .435), (-.02, 1.89), (-.18, .20)], .0065, 14500), 'sculpted-body', 'mannequin', SKIN)


def shirt(q):
    # A relaxed torso envelope with broad authored vertical folds.
    folded = q.copy()
    folded[..., 2] -= .005 * np.sin(q[..., 0] * 43 + .8) * np.clip((1.38 - q[..., 1]) / .35, 0, 1)
    f = profile(folded, [[.925, .268, .175], [1.01, .266, .178], [1.15, .254, .167],
        [1.31, .248, .145], [1.375, .246, .116], [1.415, .175, .086], [1.462, .074, .065]], 2.45)
    # Curved shirt tails: centre front/back is lower than the side seams.
    hem = .933 + .065 * np.clip(np.abs(q[..., 0]) / .27, 0, 1) ** 2
    f = np.maximum(f, hem - q[..., 1])
    for side in [-1, 1]:
        a, elbow, wrist = [side * .218, 1.34, 0], [side * .322, 1.18, .012], [side * .370, 1.008, .02]
        sleeve = capsule(q, a, elbow, .075, .057)
        # A few broad elbow folds, not photographed shading or random noise.
        ripple = .004 * np.sin((q[..., 1] - 1.15) * 120) * np.exp(-((q[..., 1] - 1.18) / .055) ** 2)
        sleeve = smooth_min(sleeve, capsule(q, elbow, wrist, .059, .037) + ripple, .024)
        # A wrist-plane opening avoids rounded solid sleeve ends.
        sleeve = np.maximum(sleeve, 1.008 - q[..., 1])
        sleeve = np.maximum(sleeve, q[..., 1] - (1.455 - .18 * np.abs(q[..., 0])))
        f = smooth_min(f, sleeve, .027)
    neck = np.sqrt(q[..., 0] ** 2 + (q[..., 2] * 1.1) ** 2) - .059
    f = np.maximum(f, np.minimum(-neck, q[..., 1] - 1.405))
    # The open first button creates a small V beneath the folded collar.
    opening = .058 * np.clip((q[..., 1] - 1.365) / .097, 0, 1)
    cut = np.minimum(opening - np.abs(q[..., 0]), np.minimum(q[..., 1] - 1.365, q[..., 2] - .015))
    f = np.maximum(f, cut)
    return f


print('Tailoring shirt shell…', flush=True)
shirt_mesh = field_mesh(shirt, [(-.445, .445), (.92, 1.48), (-.205, .215)], .0048, 14500)
# The implicit sculpt supplies the connected outside; remove planar end caps.
centres = shirt_mesh.triangles_center
normals = shirt_mesh.face_normals
keep = ~((centres[:, 1] < .938) & (np.abs(normals[:, 1]) > .85))
keep &= ~((np.abs(centres[:, 0]) > .28) & (centres[:, 1] < 1.012) & (np.abs(normals[:, 1]) > .85))
shirt_mesh.update_faces(keep)
shirt_mesh.remove_unreferenced_vertices()
add(shirt_mesh, 'tailored-shirt-body', 'white-shirt', CLOTH)


def ribbon(points, width, material, name, parent, curved=False):
    """A thin continuous strip for a placket, collar leaf, or stitched seam."""
    p = np.array(points, dtype=float)
    if curved:
        from scipy.interpolate import CubicSpline
        distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
        p = CubicSpline(distance, p, axis=0)(np.linspace(0, distance[-1], max(24, len(p) * 6)))
    left = p + np.array([-width / 2, 0, 0])
    right = p + np.array([width / 2, 0, 0])
    v = np.array([left, right]).transpose(1, 0, 2).reshape(-1, 3)
    faces = []
    for i in range(len(p) - 1):
        a = i * 2
        faces.extend([[a, a + 1, a + 2], [a + 1, a + 3, a + 2]])
    add(trimesh.Trimesh(v, faces, process=False), name, parent, material)


def band(centre, rx, rz, height, material, name, parent):
    v, faces = [], []
    for y in [centre[1] - height / 2, centre[1] + height / 2]:
        for a in np.linspace(0, np.pi * 2, 48, endpoint=False):
            v.append([centre[0] + rx * np.sin(a), y, centre[2] + rz * np.cos(a)])
    for i in range(48):
        j = (i + 1) % 48
        faces.extend([[i, j, i + 48], [j, j + 48, i + 48]])
    add(trimesh.Trimesh(v, faces, process=True), name, parent, material)


band([0, 1.447, 0], .067, .061, .032, CLOTH, 'collar-stand', 'white-shirt')
for side in [-1, 1]:
    # A folded polygonal collar leaf with a crease from neck to shoulder.
    v = np.array([[side * .008, 1.461, .065], [side * .09, 1.435, .075],
        [side * .112, 1.39, .118], [side * .052, 1.365, .162], [side * .039, 1.42, .115]])
    faces = [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]
    collar = trimesh.Trimesh(v, faces, process=False)
    add(collar, f'folded-collar-{side}', 'white-shirt', CLOTH)
    band([side * .370, 1.027, .02], .041, .039, .043, CLOTH, f'button-cuff-{side}', 'white-shirt')

# Surface following button placket, kept a few millimetres above the shirt.
ys = np.linspace(1.4, .955, 28)
front_depth = np.interp(ys, [.933, 1.01, 1.15, 1.31, 1.375, 1.415], [.179, .182, .173, .154, .126, .092])
ribbon(np.c_[np.zeros(len(ys)), ys, front_depth], .016, CLOTH, 'button-placket', 'white-shirt')
for i, y in enumerate(np.arange(1.37, .955, -.064)):
    z = np.interp(y, ys[::-1], front_depth[::-1]) + .004
    button = trimesh.creation.icosphere(subdivisions=1, radius=1)
    button.vertices *= [.0044, .0044, .002]
    button.vertices += [0, y, z]
    add(button, f'shirt-button-{i}', 'white-shirt', BUTTON)

# Pants: two front and two back sewn panels share their position seams.
print('Tailoring barrel jeans…', flush=True)
upper = np.array([[1.07, .204, .119, 0], [1.035, .208, .122, 0], [.97, .248, .149, 0],
    [.925, .257, .155, .07], [.805, .26, .14, .23], [.745, .26, .13, 1]])
lower = np.array([[.745, .13, .13, .13], [.63, .138, .13, .126], [.43, .140, .128, .127],
    [.23, .137, .106, .111], [.085, .121, .079, .076]])
# Interpolate the profiles densely for a rounded barrel silhouette.
def dense(rows, count):
    rows = rows[::-1]
    y = np.linspace(rows[0, 0], rows[-1, 0], count)[::-1]
    values = [PchipInterpolator(rows[:, 0], rows[:, k])(y) for k in range(1, 4)]
    return np.column_stack([y, *values])

up, lo = dense(upper, 28), dense(lower, 45)[1:]
verts, faces = [], []
steps = 48
for side in [-1, 1]:
    for front in [1, -1]:
        offset = len(verts)
        for row, (y, w, depth, split) in enumerate(np.r_[up, lo]):
            for i in range(steps + 1):
                t, angle = i / steps, i / steps * np.pi
                if row < len(up):
                    x = side * (w * (1 - t) * (1 - split) + w / 2 * (1 + np.cos(angle)) * split)
                    z = front * depth * ((1 - split) * np.sqrt(max(0, 1 - (1 - t) ** 2)) + split * np.sin(angle))
                else:
                    x, z = side * (w + split * np.cos(angle)), front * depth * np.sin(angle)
                verts.append([x, y, z])
        for row in range(len(up) + len(lo) - 1):
            for i in range(steps):
                a = offset + row * (steps + 1) + i
                b = a + steps + 1
                faces.extend([[a, a + 1, b], [b, a + 1, b + 1]] if side * front > 0 else [[a, b, a + 1], [b, b + 1, a + 1]])
pants = trimesh.Trimesh(verts, faces, process=True)
pants.merge_vertices()
pants.fix_normals()
add(pants, 'sewn-barrel-panels', 'barrel-jeans', DENIM)

# Small authored stitch curves are real geometry, not photographed fabric.
def seam_surface(x, y):
    # Intersect a front ray with the actual sewn panel surface.
    t = pants.triangles
    a, b, c = t[:, 0], t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]
    det = b[:, 0] * c[:, 1] - b[:, 1] * c[:, 0]
    safe = np.where(np.abs(det) > 1e-12, det, 1)
    u = ((x - a[:, 0]) * c[:, 1] - (y - a[:, 1]) * c[:, 0]) / safe
    v = (b[:, 0] * (y - a[:, 1]) - b[:, 1] * (x - a[:, 0])) / safe
    valid = (np.abs(det) > 1e-12) & (u >= -1e-7) & (v >= -1e-7) & (u + v <= 1 + 1e-7)
    z = a[:, 2] + u * b[:, 2] + v * c[:, 2]
    return (np.max(z[valid]) if np.any(valid) else 0) + .0015

for side in [-1, 1]:
    points = [[side * x, y, seam_surface(side * x, y)] for x, y in [[.105, 1.028], [.15, 1.017], [.19, .993], [.213, .953], [.206, .924]]]
    ribbon(points, .0019, STITCH, f'front-pocket-stitch-{side}', 'barrel-jeans', True)
    points = [[side * x, y, seam_surface(side * x, y)] for x, y in [[.203, 1.045], [.252, .923], [.259, .65], [.263, .43], [.244, .23], [.192, .089]]]
    ribbon(points, .002, STITCH, f'curved-side-seam-{side}', 'barrel-jeans', True)
    points = [[side * (w + r * np.cos(a)), .095, depth * np.sin(a) + .001] for a in np.linspace(0, np.pi, 32) for w, r, depth in [[.121, .076, .079]]]
    ribbon(points, .002, STITCH, f'hem-stitch-{side}', 'barrel-jeans')
points = [[.013, y, seam_surface(.013, y)] for y in np.linspace(1.027, .865, 24)]
ribbon(points, .0016, STITCH, 'fly-stitch', 'barrel-jeans')
button = trimesh.creation.icosphere(subdivisions=1, radius=1)
button.vertices *= [.007, .007, .003]
button.vertices += [0, 1.049, .125]
add(button, 'waistband-button', 'barrel-jeans', METAL)

# Ground the figure exactly, so bare feet sit on the sample's floor.
lowest = min(g.bounds[0, 1] for g in SCENE.geometry.values())
for g in SCENE.geometry.values():
    g.vertices[:, 1] -= lowest

path = ROOT / 'src/assets/modelled-outfit.glb'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_bytes(SCENE.export(file_type='glb', include_normals=True))
print(f'Wrote {path}: {path.stat().st_size:,} bytes; {sum(len(g.faces) for g in SCENE.geometry.values()):,} faces', flush=True)
