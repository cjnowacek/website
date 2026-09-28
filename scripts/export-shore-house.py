# scripts/export-shore-house.py: the Shore House walkthrough's rooms, from Blender.
#
# The room scans in the Blender file (collection `Lidar`) were cropped, rotated
# and placed by hand while the house was traced over them, and that editing
# went into the mesh data, not the object transforms. So the walkthrough does
# not place the original scan files: it uses these placed meshes, each
# exported as its own GLB in world space (glTF Y-up, the exporter's default),
# and a layout JSON with each room's public name, floor and world bounds.
#
# Run from the repo root, with the Blender that can read the file (5.2 here):
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b \
#     "C:/Dropbox/2-dev/3d/blender-shore-house/lidar_shore-house46.blend" \
#     --python scripts/export-shore-house.py -- <glb-out-dir> [--no-glb]
#
# It writes <glb-out-dir>/<id>.glb (large: 8K textures) and
# src/data/shore-house-explore.json. Then shrink the GLBs with
# `node scripts/build-models.mjs <glb-out-dir> C:/Dropbox/1-career/web-assets/~sync/models/world`
# (the same recipe as the room viewers), and run the image sync. The .blend is
# only read. --no-glb rewrites just the JSON (names, floors, bounds).
import bpy, json, os, re, sys
from mathutils import Vector

# Blender object -> public entry. Family names stay out of the site. Two scans
# of the east side share one entry. Floors: bbox centre below 3 m is downstairs.
ROOMS = {
    'LIDAR_front_house': ('front-of-the-house', 'Front of the house', 'outside'),
    'LIDAR_Street': ('street', 'Street', 'outside'),
    'LIDAR_driveway': ('driveway', 'Driveway and west side', 'outside'),
    'Mesh_0.005': ('east-side', 'East side', 'outside'),
    'Mesh_1': ('east-side', 'East side', 'outside'),
    'LIDAR_deck': ('deck', 'Deck', 'outside'),
    'LIDAR_backyard': ('backyard', 'Backyard', 'outside'),
    'LIDAR_hall': ('front-hall', 'Front hall', 'downstairs'),
    'LIDAR_stairwell': ('stairs', 'Stairs', 'downstairs'),
    'LIDAR_livingroom': ('living-room', 'Living room', 'downstairs'),
    'LIDAR_kitchen': ('kitchen', 'Kitchen', 'downstairs'),
    'LIDAR_sunroom': ('sunroom', 'Sunroom', 'downstairs'),
    'Lidar_downstairs_bathroom': ('downstairs-bathroom', 'Downstairs bathroom', 'downstairs'),
    'LIDAR_Lisas_room': ('northeast-bedroom', 'Northeast bedroom', 'downstairs'),
    'LIDAR_Andreas_room': ('southeast-bedroom', 'Southeast bedroom', 'downstairs'),
    'LIDAR_master_bedroom': ('east-bedroom', 'East bedroom', 'upstairs'),
    'LIDAR_childrens_bedroom': ('west-bedroom', 'West bedroom', 'upstairs'),
    'LIDAR_upstairs_bathroom': ('upstairs-hall-and-bath', 'Upstairs hall and bath', 'upstairs'),
}
GROUP_ORDER = ['outside', 'downstairs', 'upstairs']
EYE_HEIGHT = 1.6

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not args:
    print('usage: ... --python scripts/export-shore-house.py -- <glb-out-dir> [--no-glb]')
    sys.exit(2)
out_dir = args[0]
write_glb = '--no-glb' not in args
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
json_path = os.path.join(repo, 'src', 'data', 'shore-house-explore.json')
os.makedirs(out_dir, exist_ok=True)
os.makedirs(os.path.dirname(json_path), exist_ok=True)


def to_gltf(v):  # Blender Z-up (x, y, z) -> glTF Y-up (x, z, -y)
    return (v.x, v.z, -v.y)


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


objects = {}
def walk(col):
    for o in col.objects:
        if o.type == 'MESH' and len(o.data.vertices) >= 100:
            objects[o.name] = o
    for c in col.children:
        walk(c)
walk(bpy.data.collections['Lidar'])

missing = sorted(set(ROOMS) - set(objects))
unmapped = sorted(set(objects) - set(ROOMS))
if missing or unmapped:
    print('ROOMS table does not match the file. missing:', missing, 'unmapped:', unmapped)
    sys.exit(1)

rooms = {}
for name, o in objects.items():
    rid, title, group = ROOMS[name]
    file_slug = rid if list(v[0] for v in ROOMS.values()).count(rid) == 1 else f"{rid}-{slug(name)}"
    if write_glb:
        for other in bpy.data.objects:  # not the operator: it is a no-op in background mode, and the exports accumulated
            other.select_set(False)
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, file_slug + '.glb'), export_format='GLB',
                                  use_selection=True, export_apply=True, export_normals=False,
                                  export_texcoords=True, export_materials='EXPORT', export_image_format='AUTO',
                                  export_yup=True, export_animations=False, export_skins=False)
    corners = [to_gltf(o.matrix_world @ Vector(c)) for c in o.bound_box]
    lo = [min(c[i] for c in corners) for i in range(3)]
    hi = [max(c[i] for c in corners) for i in range(3)]
    r = rooms.setdefault(rid, {'id': rid, 'title': title, 'group': group, 'files': [], 'bbox_min': lo, 'bbox_max': hi})
    r['files'].append(file_slug + '.glb')
    r['bbox_min'] = [min(a, b) for a, b in zip(r['bbox_min'], lo)]
    r['bbox_max'] = [max(a, b) for a, b in zip(r['bbox_max'], hi)]

for r in rooms.values():
    lo, hi = r['bbox_min'], r['bbox_max']
    r['center'] = [round((a + b) / 2, 3) for a, b in zip(lo, hi)]
    # Where a visitor lands when they pick the room: its centre, at eye height above its lowest point.
    r['spawn'] = [r['center'][0], round(lo[1] + EYE_HEIGHT, 3), r['center'][2]]
    r['bbox_min'] = [round(v, 3) for v in lo]
    r['bbox_max'] = [round(v, 3) for v in hi]
    r['files'].sort()

ordered = sorted(rooms.values(), key=lambda r: (GROUP_ORDER.index(r['group']), r['id']))
layout = {
    'source': os.path.basename(bpy.data.filepath),
    'coordinates': 'glTF: metres, Y up; exported from Blender Z-up as (x, z, -y)',
    'base': '/static/img/models/world/',
    'layers': [{'id': 'scans', 'label': 'LiDAR scans', 'rooms': ordered}],
}
with open(json_path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(layout, f, indent=1)
    f.write('\n')
print(f"wrote {json_path}: {len(ordered)} rooms" + (f", GLBs in {out_dir}" if write_glb else ' (no GLB written)'))
