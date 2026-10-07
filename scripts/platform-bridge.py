"""Bounded subprocess interface to ONNX Runtime and the official OpenGradient SDK."""
import asyncio
import contextlib
import dataclasses
import enum
import importlib.metadata
import io
import json
import sys


def serializable(value):
    if dataclasses.is_dataclass(value):
        return {key: serializable(item) for key, item in dataclasses.asdict(value).items()}
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, dict):
        return {str(key): serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    if isinstance(value, bytes):
        return "0x" + value.hex()
    if hasattr(value, "tolist"):
        return value.tolist()
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def onnx_session(filename):
    import onnx
    import onnxruntime as ort
    model = onnx.load(filename, load_external_data=False)
    if any(tensor.external_data for tensor in model.graph.initializer):
        raise ValueError("Use a self-contained ONNX file; external weight files are not supported by local inference.")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return ort.InferenceSession(filename, sess_options=options, providers=["CPUExecutionProvider"])


def dispatch(request):
    operation = request["operation"]
    if operation == "example_model":
        import onnx
        from onnx import TensorProto, helper
        graph = helper.make_graph([
            helper.make_node("MatMul", ["features", "weights"], ["weighted"]),
            helper.make_node("Add", ["weighted", "bias"], ["score"]),
        ], "Tutorial weighted score", [helper.make_tensor_value_info("features", TensorProto.FLOAT, [None, 3])],
            [helper.make_tensor_value_info("score", TensorProto.FLOAT, [None, 1])],
            [helper.make_tensor("weights", TensorProto.FLOAT, [3, 1], [0.5, 2, 3]), helper.make_tensor("bias", TensorProto.FLOAT, [1], [1])])
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=9)
        onnx.checker.check_model(model)
        onnx.save(model, request["filename"])
        return {"description": "Tutorial ONNX model: score = 0.5 × first + 2 × second + 3 × third + 1. Fixed coefficients, not a trained forecast.", "example": {"features": [[1, 2, 3]]}}
    if operation in ("onnx_inspect", "onnx_run"):
        import numpy as np
        session = onnx_session(request["filename"])
        specs = lambda items: [{"name": item.name, "type": item.type, "shape": item.shape} for item in items]
        if operation == "onnx_inspect":
            return {"inputs": specs(session.get_inputs()), "outputs": specs(session.get_outputs()), "engine": "ONNX Runtime · CPU"}
        kinds = {"tensor(float)": np.float32, "tensor(double)": np.float64, "tensor(float16)": np.float16,
                 "tensor(int64)": np.int64, "tensor(int32)": np.int32, "tensor(int16)": np.int16,
                 "tensor(int8)": np.int8, "tensor(uint8)": np.uint8, "tensor(bool)": np.bool_, "tensor(string)": object}
        supplied = request["inputs"]
        expected = session.get_inputs()
        if not isinstance(supplied, dict) or set(supplied) != {item.name for item in expected}:
            raise ValueError("Supply exactly the model's named input tensors.")
        feeds = {}
        for item in expected:
            if item.type not in kinds:
                raise ValueError(f"Unsupported input type: {item.type}")
            tensor = np.asarray(supplied[item.name], dtype=kinds[item.type])
            if tensor.ndim != len(item.shape) or any(isinstance(size, int) and size != actual for size, actual in zip(item.shape, tensor.shape)):
                raise ValueError(f"Input {item.name} has shape {list(tensor.shape)}; expected {item.shape}.")
            if tensor.size > 1000000:
                raise ValueError("An input tensor exceeds one million values.")
            if np.issubdtype(tensor.dtype, np.number) and not np.isfinite(tensor).all():
                raise ValueError("Input tensors must contain finite values.")
            feeds[item.name] = tensor
        outputs = session.run(None, feeds)
        return {"outputs": [{"name": spec.name, "shape": list(value.shape), "type": str(value.dtype), "values": value.tolist()} for spec, value in zip(session.get_outputs(), outputs)], "engine": "ONNX Runtime · CPU"}

    import opengradient as og
    if operation == "sdk_status":
        return {"version": importlib.metadata.version("opengradient"), "onnx_version": importlib.metadata.version("onnxruntime"),
                "models": [{"id": model.value, "name": model.name.replace("_", " ")} for model in og.TEE_LLM if "IMAGE" not in model.name]}
    if operation in ("hub_check", "hub_publish", "hub_files"):
        hub = og.ModelHub(email=request["email"], password=request["password"])
        if operation == "hub_check":
            return {"connected": True}
        repository = request["repository"]
        if operation == "hub_files":
            return {"files": hub.list_files(repository, request["version"])}
        version = request.get("remote_version")
        if request.get("create_repository"):
            created = hub.create_model(repository, request.get("description", ""))
            version = created.initialVersion
        elif not version:
            version = hub.create_version(repository, notes=request.get("notes", "Studio upload"))["versionString"]
        if not version or version == "Unknown":
            raise ValueError("The Model Hub did not return a usable version. Check the repository before retrying.")
        result = hub.upload(request["filename"], repository, version)
        return {"repository": repository, "version": version, "file": serializable(result)}
    if operation == "wallet_address":
        from eth_account import Account
        return {"address": Account.from_key(request["private_key"]).address}
    if operation == "og_chat":
        async def generate():
            client = og.LLM(private_key=request["private_key"])
            try:
                # Token approval is an explicit separate action, never an automatic side effect.
                return await client.chat(model=og.TEE_LLM(request["model"]), messages=request["messages"],
                                         temperature=request.get("temperature", 0.3), max_tokens=request.get("max_tokens", 2048))
            finally:
                await client.close()
        return serializable(asyncio.run(generate()))
    if operation == "og_approve":
        client = og.LLM(private_key=request["private_key"])
        return serializable(client.ensure_opg_approval(min_allowance=request["amount"], approve_amount=request["amount"]))
    if operation in ("og_ml", "og_deploy", "og_workflow_result"):
        alpha = og.Alpha(private_key=request["private_key"], rpc_url="https://eth-devnet.opengradient.ai")
        if operation == "og_ml":
            return serializable(alpha.infer(model_cid=request["model_cid"], inference_mode=og.InferenceMode[request.get("mode", "VANILLA")], model_input=request["inputs"], max_retries=1))
        if operation == "og_workflow_result":
            return serializable(alpha.read_workflow_result(request["address"]))
        from opengradient.types import HistoricalInputQuery, CandleOrder, CandleType, SchedulerParams
        query = HistoricalInputQuery(base=request["base"], quote=request["quote"], total_candles=request["candles"],
                                     candle_duration_in_mins=request["candle_minutes"], order=CandleOrder.ASCENDING,
                                     candle_types=[CandleType[item] for item in request["candle_types"]])
        address = alpha.new_workflow(model_cid=request["model_cid"], input_query=query, input_tensor_name=request["input_tensor"],
                                     scheduler_params=SchedulerParams(frequency=request["frequency"], duration_hours=request["duration_hours"]))
        return {"address": address, "network": "alpha"}
    raise ValueError("Unsupported runtime operation.")


try:
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(io.StringIO()):
        result = dispatch(request)
    payload = json.dumps({"ok": True, "result": serializable(result)}, allow_nan=False)
except Exception as error:
    payload = json.dumps({"ok": False, "error": str(error), "type": type(error).__name__})
print(payload)
