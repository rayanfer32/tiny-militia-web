import xml.etree.ElementTree as ET
import json
import os

tree = ET.parse('public/data/1outpost_new.tmx')
root = tree.getroot()

width = int(root.attrib.get('width', 52))
height = int(root.attrib.get('height', 18))
tilewidth = int(root.attrib.get('tilewidth', 64))
tileheight = int(root.attrib.get('tileheight', 64))

map_data = {
    'width': width * tilewidth,
    'height': height * tileheight,
    'spawns': [],
    'weapon_spawns': [],
    'decorations': [],
    'collision_polys': []
}

for og in root.findall('objectgroup'):
    for obj in og.findall('object'):
        name = obj.attrib.get('name', '')
        ox = float(obj.attrib.get('x', 0))
        oy = float(obj.attrib.get('y', 0))
        
        props = {}
        properties_elem = obj.find('properties')
        if properties_elem is not None:
            for p in properties_elem.findall('property'):
                props[p.attrib.get('name')] = p.attrib.get('value')
                
        poly = obj.find('polygon')
        if poly is not None:
            pts_str = poly.attrib.get('points', '').strip()
            pts = []
            for pair in pts_str.split():
                if ',' in pair:
                    px, py = pair.split(',')
                    pts.append([ox + float(px), oy + float(py)])
            map_data['collision_polys'].append({
                'id': obj.attrib.get('id'),
                'points': pts
            })
        elif name.startswith('sp_') or name.startswith('ctf_sp'):
            map_data['spawns'].append({'name': name, 'x': ox, 'y': oy})
        elif name.startswith('wp_') or name.startswith('ctf_wp'):
            map_data['weapon_spawns'].append({
                'name': name,
                'x': ox,
                'y': oy,
                'weapon': props.get('weapon', 'ak47')
            })
        elif name.startswith('sprite'):
            map_data['decorations'].append({
                'type': props.get('sprite', 'palmTree'),
                'x': ox,
                'y': oy
            })

with open('public/data/outpost.json', 'w') as f:
    json.dump(map_data, f, indent=2)

print('Outpost parsed successfully:')
print('Collision polys:', len(map_data['collision_polys']))
print('Spawns:', len(map_data['spawns']))
print('Weapon spawns:', len(map_data['weapon_spawns']))
print('Decorations:', len(map_data['decorations']))
