import os
import subprocess
from pathlib import Path


def process_zk_response(invoice_data, risk_result, benchmark_result=None, threshold=19):
    base_dir = Path(__file__).resolve().parents[1]
    prover_path = base_dir / "Prover.toml"
    proof_dir = base_dir / "target" / "proof"

    score = risk_result.get("risk_score") if isinstance(risk_result, dict) else risk_result
    action = risk_result.get("final_action") if isinstance(risk_result, dict) else None

    result = {
        "proof_generated": False,
        "risk_score": score,
    }

    # Only explicitly approved, low-risk invoices may reach the circuit.
    if action != "APPROVE" or not isinstance(score, (int, float)) or score > threshold:
        return {
            **result,
            "status": "BLOCKED_BY_RISK_CHECK",
            "message": "A proof is generated only for APPROVE decisions with risk score at most 19.",
        }

    if not isinstance(benchmark_result, dict) or not benchmark_result.get("benchmark_available", True):
        return {
            **result,
            "status": "NO_BENCHMARK",
            "message": "No usable reference-price benchmark is available.",
        }

    try:
        unit_price = float(invoice_data["unit_price"])
        quantity = int(invoice_data["quantity"])
        total = float(
            invoice_data.get(
                "total",
                invoice_data.get("declared_total", invoice_data.get("total_amount"))
            )
        )
        minimum = float(benchmark_result["minimum_acceptable_price"])
        maximum = float(benchmark_result["maximum_acceptable_price"])

        # This circuit currently uses whole-number currency units.
        values = [unit_price, total, minimum, maximum]
        if any(not value.is_integer() for value in values):
            raise ValueError("The current Noir circuit requires whole-number currency values.")

        unit_price, total, minimum, maximum = map(int, values)

        if quantity <= 0:
            raise ValueError("Invoice quantity must be greater than zero.")

        if minimum > maximum:
            raise ValueError("Benchmark minimum cannot exceed benchmark maximum.")

        if not (minimum <= unit_price <= maximum):
            return {
                **result,
                "status": "OUTSIDE_PRICE_BENCHMARK",
                "message": "Declared unit price is outside the benchmark range.",
            }

        if unit_price * quantity != total:
            return {
                **result,
                "status": "ARITHMETIC_MISMATCH",
                "message": "Declared total does not equal unit price multiplied by quantity.",
            }

        # Preserve the user's existing Prover.toml after this run.
        previous_toml = prover_path.read_text(encoding="utf-8") if prover_path.exists() else None

        prover_contents = (
            f'declared_unit_price = "{unit_price}"\n'
            f'declared_quantity = "{quantity}"\n'
            f'declared_total = "{total}"\n'
            f'price_reference_min = "{minimum}"\n'
            f'price_reference_max = "{maximum}"\n'
            f'max_allowed_risk_score = "{threshold}"\n'
            f'calculated_risk_score = "{int(score)}"\n'
        )

        try:
            prover_path.write_text(prover_contents, encoding="utf-8")

            def run_command(command):
                completed = subprocess.run(
                    command,
                    cwd=base_dir,
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
                if completed.returncode != 0:
                    raise RuntimeError(
                        f"Command failed: {' '.join(command)}\n"
                        f"{completed.stdout}\n{completed.stderr}"
                    )
                return completed

            run_command(["nargo", "execute", "witness"])

            proof_dir.mkdir(parents=True, exist_ok=True)

            run_command([
                "bb", "prove",
                "-s", "ultra_honk",
                "-b", "target/zk_standalone.json",
                "-w", "target/witness.gz",
                "-o", "target/proof",
                "--oracle_hash", "keccak",
                "--write_vk",
                "--verify",
            ])

            proof_path = proof_dir / "proof"
            public_inputs_path = proof_dir / "public_inputs"

            if not proof_path.is_file() or not public_inputs_path.is_file():
                raise RuntimeError("Barretenberg did not produce the expected proof files.")

            proof_hex = "0x" + proof_path.read_bytes().hex()
            public_inputs_bytes = public_inputs_path.read_bytes()

            if len(public_inputs_bytes) % 32 != 0:
                raise RuntimeError("Public inputs file has an invalid length.")

            public_inputs = [
                "0x" + public_inputs_bytes[i:i + 32].hex()
                for i in range(0, len(public_inputs_bytes), 32)
            ]

            return {
                "status": "PROOF_GENERATED",
                "proof_generated": True,
                "risk_score": score,
                "proof": proof_hex,
                "public_inputs": public_inputs,
                "proof_file": str(proof_path),
                "public_inputs_file": str(public_inputs_path),
            }

        finally:
            if previous_toml is not None:
                prover_path.write_text(previous_toml, encoding="utf-8")
            elif prover_path.exists():
                prover_path.unlink()

    except Exception as exc:
        return {
            **result,
            "status": "PROOF_GENERATION_FAILED",
            "error": str(exc),
        }
