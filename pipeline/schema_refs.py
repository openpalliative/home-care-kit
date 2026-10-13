import copy


def _resolve(node, defs, stack):
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            name = ref.split("/")[-1]
            if name in stack:
                raise ValueError(f"цикл в $ref: {name}")
            target = _resolve(copy.deepcopy(defs[name]), defs, stack | {name})
            rest = {k: _resolve(v, defs, stack) for k, v in node.items() if k != "$ref"}
            return {**target, **rest}
        return {k: _resolve(v, defs, stack) for k, v in node.items() if k != "$defs"}
    if isinstance(node, list):
        return [_resolve(v, defs, stack) for v in node]
    return node


def inline_refs(schema: dict) -> dict:
    return _resolve(schema, schema.get("$defs", {}), frozenset())
