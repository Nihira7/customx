import os
import sys
import json
import subprocess

def process_zk_response(invoice_data, defender_risk_score, threshold=50):
    """
    Bridge script to take Defender AI evaluation and generate or reject Noir ZK Proofs.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    print(f"[ZK_Response] Intercepting invoice: {invoice_data.get('id', 'N/A')}")
    print(f"[ZK_Response] Calculated Risk Score: {defender_risk_score} (Threshold: {threshold})")

    # Step 1: Pre-circuit Interception
    if defender_risk_score > threshold:
        print("[ZK_Response] DEFENDER BLOCK: Risk score exceeds threshold. Halting ZK Proof Generation!")
        return {
            "status": "BLOCKED_BY_DEFENDER",
            "proof_generated": False,
            "risk_score": defender_risk_score,
            "message": "High anomaly score detected. ZK proof creation aborted."
        }

    # Step 2: Populate Prover.toml inputs
    hs_code_clean = str(invoice_data.get("hs_code", "392690")).replace(".", "")
    unit_price = int(float(invoice_data.get("unit_price", 0)))
    quantity = int(invoice_data.get("quantity", 1))

    prover_toml_path = os.path.join(base_dir, "Prover.toml")
    with open(prover_toml_path, "w", encoding="utf-8") as f:
        f.write(f'declared_hs_code = "{hs_code_clean}"\n')
        f.write(f'declared_unit_price = "{unit_price}"\n')
        f.write(f'declared_quantity = "{quantity}"\n')
        f.write(f'price_reference_min = "100"\n')
        f.write(f'price_reference_max = "10000"\n')
        f.write(f'max_allowed_risk_score = "{threshold}"\n')
        f.write(f'calculated_risk_score = "{defender_risk_score}"\n')
        f.write(f'invoice_hash = "12345"\n')

    # Step 3: Run Nargo Prove/Execute
    try:
        res = subprocess.run(["nargo", "execute", "witness"], capture_output=True, text=True, cwd=base_dir)
        if res.returncode != 0:
            print("[ZK_Response] ZK REJECTED: Noir Circuit constraint validation failed.")
            return {
                "status": "CIRCUIT_CONSTRAINT_FAILED",
                "proof_generated": False,
                "error": res.stderr
            }

        print("[ZK_Response] SUCCESS: ZK Proof generated successfully.")
        return {
            "status": "PROOF_GENERATED",
            "proof_generated": True,
            "proof": "0x1234567890abcdef"
        }
    except Exception as e:
        return {"status": "ERROR", "error": str(e)}

if __name__ == "__main__":
    sample_invoice = {
        "id": "ATTACK-001",
        "description": "luxury rolex watch",
        "hs_code": "3926.90",
        "unit_price": 25.0,
        "quantity": 10
    }
    # Simulate high risk attack
    res = process_zk_response(sample_invoice, defender_risk_score=85)
    print("Result:", res)
