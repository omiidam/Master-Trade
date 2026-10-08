#!/usr/bin/env python3
"""Merge the trained Needle 3 router adapter into a runnable checkpoint (Phase 2.14.B).

`needle run` loads a checkpoint, not an adapter: `load_checkpoint` reads the
base weights and nothing else. So the LoRA the fine-tune writes has to be
merged before the runtime can use it, and the merge has to reproduce what
the training loss was measured under:

  * `merge_lora(params, lora, scale)` with the adapter's own scale
    (`lora_alpha / lora_rank`, stored in the adapter metadata);
  * `cq_ste_params(merged, WEIGHT_BITS)` — the W4 straight-through
    quantisation the fine-tune's forward pass used, so the merged weights
    sit on the same grid the model was trained to expect.

Run it with the Cactus venv's interpreter:

    ~/needle3/.venv/bin/python tools/needle3-router-merge.py

Paths default to the installed locations and can be overridden:

    BASE=... ADAPTER=... OUT=... ~/needle3/.venv/bin/python tools/needle3-router-merge.py
"""

import ast
import os
import site
import sys

# The Cactus package lives in the installed venv. When this script is run by
# an interpreter that cannot import it (`python3 tools/…`), it re-executes
# itself with the venv's own interpreter instead of failing — the package is a
# property of the installation, not of the caller's environment.
VENV = os.path.expanduser(os.environ.get("NEEDLE3_VENV", "~/needle3/.venv"))
_VENV_PYTHON = os.path.join(VENV, "bin", "python")


def _ensure_venv_interpreter():
    try:
        import needle  # noqa: F401
    except ImportError:
        if _VENV_PYTHON != sys.executable and os.path.exists(_VENV_PYTHON):
            os.execv(_VENV_PYTHON, [_VENV_PYTHON, os.path.abspath(__file__), *sys.argv[1:]])
        for candidate in (
            *site.getsitepackages(),
            os.path.join(
                VENV, "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages"
            ),
        ):
            if candidate not in sys.path:
                sys.path.insert(0, candidate)


_ensure_venv_interpreter()

import jax  # noqa: E402
import numpy as np  # noqa: E402
from needle.model.checkpoints import (  # noqa: E402
    read_adapter,
    read_checkpoint,
    write_checkpoint,
)
from needle.model.finetune import merge_lora  # noqa: E402
from needle.model.quantize import WEIGHT_BITS, cq_ste_params  # noqa: E402

# `flax` arrives with the needle package; imported for the flattened key space.
from flax.traverse_util import flatten_dict  # noqa: E402

BASE = os.path.expanduser(
    os.environ.get("BASE", "~/needle3/models/checkpoints/needle3.safetensors")
)
ADAPTER = os.path.expanduser(
    os.environ.get("ADAPTER", "~/needle3/models/checkpoints/needle3-router-adapter.safetensors")
)
OUT = os.path.expanduser(
    os.environ.get("OUT", "~/needle3/models/checkpoints/needle3-router.safetensors")
)


def as_key(key):
    """`read_adapter` hands string keys; the flattened base is indexed by tuples."""
    if isinstance(key, tuple):
        return key
    if key.startswith("("):
        return ast.literal_eval(key)
    return tuple(key.split("/"))


def main():
    base = read_checkpoint(BASE)
    adapter = read_adapter(ADAPTER)
    scale = float(adapter.get("scale") or 2.0)

    lora = {as_key(key): value for key, value in adapter["lora"].items()}
    flat = flatten_dict(base["params"])
    missing = [key for key in lora if key not in flat]
    if missing:
        raise SystemExit(f"adapter weight groups are not in the base checkpoint: {missing[:2]}")

    merged = merge_lora(base["params"], lora, scale)
    merged = cq_ste_params(merged, WEIGHT_BITS)
    merged = jax.tree.map(lambda leaf: np.asarray(leaf), merged)
    write_checkpoint(OUT, dict(base, params=merged))
    print(f"merged {len(lora)} weight groups -> {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
