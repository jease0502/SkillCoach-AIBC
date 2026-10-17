"""Shrink a VRM 1.0 avatar for the web.

    python tools/avatars/slim_vrm.py in.vrm out.vrm [--max-texture 1024]

- Keeps only the morph targets that VRM expressions use (visemes, blink, emotions,
  look directions) and drops the rest, remapping the expression bindings.
- Drops morph-target normals (lighting barely changes for small face shapes).
- Downscales textures to --max-texture pixels and re-encodes them as JPEG
  (PNG is kept when the image has transparency).
- Attaches the embedded normal maps that no material used.
- Flips the V texture coordinate (the Rocketbox export kept FBX's bottom-up V).
- Rewrites the binary chunk with only the data that is still referenced.

The VRMC_vrm extension JSON is carried over unchanged apart from the morph
target indices, so any VRM 1.0 loader (three-vrm) reads the result.
"""
from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, _version, _length = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF", "not a GLB file"
    off, doc, bin_ = 12, None, b""
    while off < len(data):
        ln, kind = struct.unpack("<I4s", data[off:off + 8])
        chunk = data[off + 8:off + 8 + ln]
        if kind == b"JSON":
            doc = json.loads(chunk)
        elif kind == b"BIN\x00":
            bin_ = chunk
        off += 8 + ln
    return doc, bin_


def write_glb(path: Path, doc: dict, bin_: bytes) -> None:
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    bin_ += b"\x00" * (-len(bin_) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with path.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(bin_), b"BIN\x00") + bin_)


def view_bytes(doc: dict, bin_: bytes, view_index: int) -> bytes:
    v = doc["bufferViews"][view_index]
    start = v.get("byteOffset", 0)
    return bin_[start:start + v["byteLength"]]


VRM_LICENSE = "https://vrm.dev/licenses/1.0/"


def fix_meta_license(doc: dict) -> None:
    """VRM 1.0 requires meta.licenseUrl to be the VRM licence; the asset's own
    licence (Rocketbox, MIT) belongs in otherLicenseUrl. three-vrm rejects anything else."""
    meta = doc["extensions"]["VRMC_vrm"].setdefault("meta", {})
    if meta.get("licenseUrl") != VRM_LICENSE:
        if meta.get("licenseUrl"):
            meta.setdefault("otherLicenseUrl", meta["licenseUrl"])
        meta["licenseUrl"] = VRM_LICENSE


def attach_normal_maps(doc: dict) -> None:
    """The Rocketbox export embeds `<part>_normal` images but no material uses them;
    wire each one to the material whose base colour is `<part>_color...`, so skin and
    cloth get their surface detail back."""
    images = doc.get("images", [])
    textures = doc.get("textures", [])
    tex_of_image = {t.get("source"): i for i, t in enumerate(textures)}
    normals = {img.get("name", "").split("_normal")[0]: i for i, img in enumerate(images) if "_normal" in img.get("name", "")}
    for mat in doc.get("materials", []):
        base = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if not base or "normalTexture" in mat:
            continue
        name = images[textures[base["index"]]["source"]].get("name", "")
        image_index = normals.get(name.split("_color")[0])
        if image_index is not None and image_index in tex_of_image:
            mat["normalTexture"] = {"index": tex_of_image[image_index], "scale": 1.0}


def prune_morph_targets(doc: dict) -> None:
    vrm = doc["extensions"]["VRMC_vrm"]
    binds = [b for e in vrm["expressions"].get("preset", {}).values() for b in e.get("morphTargetBinds", [])]
    binds += [b for e in vrm["expressions"].get("custom", {}).values() for b in e.get("morphTargetBinds", [])]
    used: dict[int, set[int]] = {}
    for b in binds:
        mesh = doc["nodes"][b["node"]]["mesh"]
        used.setdefault(mesh, set()).add(b["index"])
    remap: dict[int, dict[int, int]] = {}
    for mesh_index, mesh in enumerate(doc["meshes"]):
        keep = sorted(used.get(mesh_index, set()))
        remap[mesh_index] = {old: new for new, old in enumerate(keep)}
        for prim in mesh["primitives"]:
            if "targets" in prim:
                prim["targets"] = [{k: v for k, v in prim["targets"][i].items() if k != "NORMAL"} for i in keep]
                if not prim["targets"]:
                    del prim["targets"]
        if "weights" in mesh:
            mesh["weights"] = [mesh["weights"][i] for i in keep]
        names = mesh.get("extras", {}).get("targetNames")
        if names:
            mesh["extras"]["targetNames"] = [names[i] for i in keep]
    for b in binds:
        mesh = doc["nodes"][b["node"]]["mesh"]
        b["index"] = remap[mesh][b["index"]]


def sparsify_morph_targets(doc: dict, bin_: bytes) -> bytes:
    """Store morph-target deltas as sparse accessors: face shapes move only a few
    hundred of the body's vertices, so most of each dense target is zeros.
    New index/value data is appended to the BIN chunk; returns the new chunk."""
    import numpy as np

    extra = bytearray(bin_)
    done: set[int] = set()
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            for t in prim.get("targets", []):
                for acc_index in t.values():
                    if acc_index in done:
                        continue
                    done.add(acc_index)
                    acc = doc["accessors"][acc_index]
                    if acc.get("sparse") or "bufferView" not in acc or acc["componentType"] != 5126 or acc["type"] != "VEC3":
                        continue
                    view = doc["bufferViews"][acc["bufferView"]]
                    stride = view.get("byteStride", 12)
                    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
                    raw = np.frombuffer(bytes(bin_[start:start + stride * acc["count"]]), dtype=np.uint8)
                    raw = raw.reshape(acc["count"], stride)[:, :12].copy()
                    vals = raw.view(np.float32).reshape(acc["count"], 3)
                    nz = np.flatnonzero(np.abs(vals).max(axis=1) > 2e-5).astype(np.uint32)
                    sparse_vals = vals[nz].astype(np.float32)

                    def append(data: bytes) -> int:
                        extra.extend(b"\x00" * (-len(extra) % 4))
                        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(extra), "byteLength": len(data)})
                        extra.extend(data)
                        return len(doc["bufferViews"]) - 1

                    del acc["bufferView"]
                    acc.pop("byteOffset", None)
                    if len(nz) == 0:
                        acc["min"], acc["max"] = [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]
                        continue
                    acc["sparse"] = {
                        "count": int(len(nz)),
                        "indices": {"bufferView": append(nz.tobytes()), "componentType": 5125},
                        "values": {"bufferView": append(sparse_vals.tobytes())},
                    }
    return bytes(extra)


def flip_v(doc: dict, bin_: bytes) -> bytes:
    """v -> 1 - v on every TEXCOORD_0. The Rocketbox FBX -> glTF export kept FBX's
    bottom-up V axis, so the head texture's hair band landed on the forehead."""
    import numpy as np

    out = bytearray(bin_)
    done: set[int] = set()
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            i = prim["attributes"].get("TEXCOORD_0")
            if i is None or i in done:
                continue
            done.add(i)
            acc = doc["accessors"][i]
            assert acc["componentType"] == 5126 and acc["type"] == "VEC2", "only float UVs are supported"
            view = doc["bufferViews"][acc["bufferView"]]
            stride = view.get("byteStride", 8)
            start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
            for k in range(acc["count"]):
                o = start + k * stride + 4
                (v,) = struct.unpack_from("<f", out, o)
                struct.pack_into("<f", out, o, 1.0 - v)
            acc.pop("min", None)
            acc.pop("max", None)
    return bytes(out)


def shrink_images(doc: dict, bin_: bytes, max_size: int) -> dict[int, bytes]:
    """Return {image_index: new_bytes} for images stored in buffer views."""
    out = {}
    for i, img in enumerate(doc.get("images", [])):
        if "bufferView" not in img:
            continue
        im = Image.open(io.BytesIO(view_bytes(doc, bin_, img["bufferView"])))
        im.load()
        if max(im.size) > max_size:
            scale = max_size / max(im.size)
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        has_alpha = im.mode in ("RGBA", "LA") and im.getextrema()[-1][0] < 255
        buf = io.BytesIO()
        if has_alpha:
            im.save(buf, "PNG", optimize=True)
            img["mimeType"] = "image/png"
        else:
            im.convert("RGB").save(buf, "JPEG", quality=85, optimize=True)
            img["mimeType"] = "image/jpeg"
        out[i] = buf.getvalue()
    return out


def rebuild_buffer(doc: dict, bin_: bytes, new_images: dict[int, bytes]) -> bytes:
    """Keep only referenced accessors and buffer views, and pack them into a new BIN chunk."""
    used_acc: set[int] = set()
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            used_acc.update(prim["attributes"].values())
            if "indices" in prim:
                used_acc.add(prim["indices"])
            for t in prim.get("targets", []):
                used_acc.update(t.values())
    for skin in doc.get("skins", []):
        if "inverseBindMatrices" in skin:
            used_acc.add(skin["inverseBindMatrices"])
    for anim in doc.get("animations", []):
        for s in anim["samplers"]:
            used_acc.update((s["input"], s["output"]))

    acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
    accessors = [doc["accessors"][i] for i in sorted(used_acc)]

    chunks: list[bytes] = []
    views: list[dict] = []
    view_map: dict[int, int] = {}
    offset = 0

    def add_view(data: bytes, template: dict) -> int:
        nonlocal offset
        pad = -offset % 4
        if pad:
            chunks.append(b"\x00" * pad)
            offset += pad
        v = {k: val for k, val in template.items() if k not in ("byteOffset", "byteLength", "buffer")}
        v.update(buffer=0, byteOffset=offset, byteLength=len(data))
        chunks.append(data)
        offset += len(data)
        views.append(v)
        return len(views) - 1

    def move_view(old: int) -> int:
        if old not in view_map:
            view_map[old] = add_view(view_bytes(doc, bin_, old), doc["bufferViews"][old])
        return view_map[old]

    for acc in accessors:
        if "bufferView" in acc:
            acc["bufferView"] = move_view(acc["bufferView"])
        if "sparse" in acc:
            for part in ("indices", "values"):
                acc["sparse"][part]["bufferView"] = move_view(acc["sparse"][part]["bufferView"])
    for i, img in enumerate(doc.get("images", [])):
        if "bufferView" in img:
            old = img["bufferView"]
            data = new_images.get(i, view_bytes(doc, bin_, old))
            img["bufferView"] = add_view(data, {})

    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            prim["attributes"] = {k: acc_map[v] for k, v in prim["attributes"].items()}
            if "indices" in prim:
                prim["indices"] = acc_map[prim["indices"]]
            if "targets" in prim:
                prim["targets"] = [{k: acc_map[v] for k, v in t.items()} for t in prim["targets"]]
    for skin in doc.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = acc_map[skin["inverseBindMatrices"]]
    for anim in doc.get("animations", []):
        for s in anim["samplers"]:
            s["input"], s["output"] = acc_map[s["input"]], acc_map[s["output"]]

    doc["accessors"] = accessors
    doc["bufferViews"] = views
    data = b"".join(chunks)
    doc["buffers"] = [{"byteLength": len(data)}]
    return data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--max-texture", type=int, default=1024)
    ap.add_argument("--keep-images", action="store_true", help="copy textures unchanged")
    ap.add_argument("--no-flip-v", action="store_true", help="keep TEXCOORD_0 as is (assets already in glTF orientation)")
    a = ap.parse_args()
    doc, bin_ = read_glb(a.src)
    fix_meta_license(doc)
    attach_normal_maps(doc)
    doc["extensions"]["VRMC_vrm"]["meta"]["name"] = a.dst.stem.replace("_", " ")
    if not a.no_flip_v:
        bin_ = flip_v(doc, bin_)
    prune_morph_targets(doc)
    bin_ = sparsify_morph_targets(doc, bin_)
    images = {} if a.keep_images else shrink_images(doc, bin_, a.max_texture)
    new_bin = rebuild_buffer(doc, bin_, images)
    a.dst.parent.mkdir(parents=True, exist_ok=True)
    write_glb(a.dst, doc, new_bin)
    print(f"{a.src.name}: {a.src.stat().st_size / 1e6:.1f} MB -> {a.dst.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
