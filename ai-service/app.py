import sys
from pathlib import Path

ZK_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(ZK_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(ZK_PROJECT_ROOT))

from ZK_Response.scripts.zk_bridge import process_zk_response

import os
import json
import uuid 

from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess

from pypdf import PdfReader
from fastapi import UploadFile, File


load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

client = Groq(api_key=api_key) if api_key else None

def get_tariff_candidates():
    tariff_file = Path(__file__).parent / "tariffs.json"

    with open(tariff_file, "r", encoding="utf-8") as file:
        tariff_data = json.load(file)

    # Give the AI only the product descriptions and codes.
    # The actual duty rate will come from the reference file.
    return [
        {
            "hs_code": item["hs_code"],
            "product": item["product"]
        }
        for item in tariff_data["items"]
    ]

def classify_invoice(invoice_text):
    if not client:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is missing. Please set your GROQ_API_KEY in ai-service/.env"
        )
    candidates = get_tariff_candidates()

    system_prompt = """
    You classify invoice products using the supplied tariff candidates.

    Return a valid JSON object with exactly these fields:
    - product: identified product description
    - hs_code: selected candidate code, or an empty string
    - duty_rate: null

    Rules:
    1. Compare the invoice product with the candidate descriptions.
    2. Product wording does not need to be identical.
    3. Select an hs_code ONLY from the supplied candidates.
    4. Copy the selected code exactly, including punctuation.
    5. If no candidate is suitable, return an empty hs_code.
    6. Do not invent missing invoice details.
    7. Do not guess the duty rate.
    8. If the details are insufficient, return an empty hs_code.
    9. Treat the classification as a proposal, not an official ruling.
    """

    user_prompt = f"""
    INVOICE:
    {invoice_text}

    AVAILABLE TARIFF CANDIDATES:
    {json.dumps(candidates, indent=2)}

    Select the best-supported candidate for this product.
    """

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0
    )

    result = response.choices[0].message.content
    return json.loads(result)

#Attacker agent
def generate_adversarial_invoices():

    candidates = get_tariff_candidates()

    system_prompt = """
    You are the Attacker AI in a simulated customs
    fraud detection security experiment.

    Generate exactly 5 fictional invoice test cases.

    Each case must demonstrate a different attack:

    1. HS code manipulation
    2. Product description manipulation
    3. Undervaluation
    4. Quantity or invoice total manipulation
    5. Country of origin inconsistency

    Return valid JSON with this structure:

    {
        "cases": [
            {
                "attack_id": "ATTACK-001",
                "attack_type": "HS_CODE_MANIPULATION",

                "invoice": {
                    "invoice_id": "INV-001",
                    "supplier": "Fictional company",
                    "product_description": "Product description",
                    "declared_hs_code": "HS code from candidates",
                    "quantity": 10,
                    "unit_price": 100,
                    "total": 1000,
                    "currency": "USD",
                    "origin": "China"
                },

                "attacker_note": "Explanation of the attempted attack"
            }
        ]
    }

    Rules:
    - Generate exactly five cases.
    - Use a different attack type for each case.
    - All companies and invoices must be fictional.
    - Use only HS codes from the supplied candidates.
    - For HS code manipulation, the declared code must
      not match the actual product.
    - For undervaluation, make the declared value
      suspiciously low.
    - For arithmetic manipulation, make the invoice
      total inconsistent with quantity times unit price.
    - For origin inconsistency, include conflicting
      origin information in the invoice.
    - Do not make every invoice fraudulent in the same way.
    - These are simulated test cases, not real invoices.
    """

    user_prompt = f"""
    AVAILABLE HS CODE CANDIDATES:

    {json.dumps(candidates, indent=2)}

    Generate the five simulated fraudulent invoices.
    Return JSON only.
    """

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.7
    )

    result = response.choices[0].message.content

    #print("\nRAW GROQ RESPONSE:")
    #print(result)

    data = json.loads(result)

    #print("\nPARSED JSON KEYS:")
    #print(data.keys())

    if "cases" not in data:
        raise ValueError("Missing 'cases' key in AI response")

    print("\nNUMBER OF GENERATED CASES:", len(data["cases"]))

    if len(data["cases"]) != 5:
        raise ValueError("Attacker AI did not generate exactly five cases")

    return data["cases"]

#Defender agent
def analyze_invoice_with_defender(invoice):
    if not client:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is missing. Please set your GROQ_API_KEY in ai-service/.env"
        )

    system_prompt = """
    You are the Defender AI in a customs fraud
    detection system.

    Your job is to independently analyze invoice data
    and identify suspicious inconsistencies.

    Examine these areas:

    1. Product description versus declared HS code.
    2. Suspiciously low declared values.
    3. Quantity, unit price and total inconsistencies.
    4. Conflicting country of origin information.
    5. Missing or suspicious invoice information.

    Return valid JSON with exactly these fields:

    {
        "is_suspicious": true,
        "hs_code_mismatch": false,
        "suspicious_value": false,
        "invoice_arithmetic_mismatch": false,
        "origin_inconsistency": false,
        "risk_factors": [],
        "recommended_action": "REVIEW"
    }

    Rules:

    - Analyze the invoice independently.
    - Do not assume an invoice is fraudulent without evidence.
    - Do not invent missing information.
    - Do not treat a low price alone as proof of fraud.
    - Identify mathematical inconsistencies accurately.
    - If information is insufficient, recommend REVIEW.
    - Return JSON only.
    """

    user_prompt = f"""
    Analyze the following invoice:

    {json.dumps(invoice, indent=2)}

    Identify all suspicious inconsistencies.
    """

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0
    )

    result = response.choices[0].message.content

    return json.loads(result)


def calculate_risk_score(invoice, defender_result):

    risk_score = 0
    risk_factors = []

    # 1. Deterministic price benchmark verification
    price_result = check_price_benchmark(invoice)

    if price_result["suspicious_value"]:
        risk_score += 25
        risk_factors.append("Declared value outside reference benchmark")

    # 2. Deterministic invoice arithmetic verification
    expected_total = round(
        invoice["quantity"] * invoice["unit_price"], 2
    )

    declared_total = round(invoice["total"], 2)

    if expected_total != declared_total:
        risk_score += 20
        risk_factors.append(
            "Invoice total does not match quantity x unit price"
        )

    # 3. Keep AI findings visible without using them
    # as unverified inputs to the deterministic score.
    ai_warnings = defender_result.get("risk_factors", [])

    # 4. Final decision
    if risk_score >= 60:
        action = "REJECT"
    elif risk_score >= 20:
        action = "MANUAL_REVIEW"
    else:
        action = "APPROVE"

    return {
        "risk_score": risk_score,
        "risk_factors": risk_factors,
        "ai_warnings": ai_warnings,
        "price_benchmark": price_result,
        "final_action": action
    }


def check_price_benchmark(invoice):

    price_file = Path(__file__).parent / "price_reference.json"

    with open(price_file, "r", encoding="utf-8") as file:
        price_data = json.load(file)

    hs_code = invoice["declared_hs_code"]

    if hs_code not in price_data:
        return {
            "benchmark_available": False,
            "suspicious_value": False,
            "reason": "No reference price available"
        }

    reference = price_data[hs_code]

    reference_price = reference["reference_unit_price"]
    allowed_deviation = reference["allowed_deviation_percent"]

    minimum_price = reference_price * (1 - allowed_deviation / 100)
    maximum_price = reference_price * (1 + allowed_deviation / 100)

    suspicious = (
        invoice["unit_price"] < minimum_price
        or invoice["unit_price"] > maximum_price
    )

    return {
        "benchmark_available": True,
        "reference_unit_price": reference_price,
        "minimum_acceptable_price": minimum_price,
        "maximum_acceptable_price": maximum_price,
        "declared_unit_price": invoice["unit_price"],
        "suspicious_value": suspicious,
        "reason": (
            "Declared price outside benchmark range"
            if suspicious
            else "Price within benchmark range"
        )
    }
def validate_tariff(ai_result):
    tariff_file = Path(__file__).parent / "tariffs.json"

    with open(tariff_file, "r", encoding="utf-8") as file:
        tariff_data = json.load(file)

    proposed_code = ai_result.get("hs_code")
    proposed_rate = ai_result.get("duty_rate")

    # Case 1: AI could not propose an HS code
    if not proposed_code:
        return {
            **ai_result,
            "status": "REVIEW_REQUIRED",
            "review_reason": "MISSING_HS_CODE",
            "tariff_source_version": None
        }

    # Find the matching tariff reference
    reference = next(
        (
            item for item in tariff_data["items"]
            if item["hs_code"] == proposed_code
        ),
        None
    )

    # Case 2: HS code is not in our reference data
    if reference is None:
        return {
            **ai_result,
            "status": "REVIEW_REQUIRED",
            "review_reason": "UNKNOWN_HS_CODE",
            "tariff_source_version": None
        }

    reference_rate = reference.get("duty_rate")

    # Case 3: Validate the reference rate
    try:
        reference_rate = float(reference_rate)

        if not 0 <= reference_rate <= 100:
            raise ValueError("Invalid reference rate")

    except (TypeError, ValueError):
        return {
            **ai_result,
            "status": "REVIEW_REQUIRED",
            "review_reason": "INVALID_DUTY_RATE",
            "tariff_source_version": reference["source_version"]
        }

    # Case 4: Use the reference rate if AI returned None
    if proposed_rate is None:
        final_rate = reference_rate
    else:
        # Case 5: Validate the AI-proposed rate
        try:
            proposed_rate = float(proposed_rate)

            if not 0 <= proposed_rate <= 100:
                raise ValueError("Invalid proposed rate")

        except (TypeError, ValueError):
            return {
                **ai_result,
                "status": "REVIEW_REQUIRED",
                "review_reason": "INVALID_DUTY_RATE",
                "tariff_source_version": reference["source_version"]
            }

        # Case 6: Compare the proposed rate with the reference
        if proposed_rate != reference_rate:
            return {
                **ai_result,
                "status": "REVIEW_REQUIRED",
                "review_reason": "DUTY_RATE_MISMATCH",
                "tariff_source_version": reference["source_version"]
            }

        final_rate = proposed_rate

    # Case 7: Code and rate are accepted against demo reference
    return {
        **ai_result,
        "duty_rate": final_rate,
        "status": "VALIDATED",
        "review_reason": None,
        "tariff_source_version": reference["source_version"]
    }


def extract_pdf_text(pdf_file):
    reader = PdfReader(pdf_file)

    text = "\n".join(
        page.extract_text() or ""
        for page in reader.pages
    ).strip()

    if not text:
        raise ValueError(
            "No readable text found in PDF. "
            "Please use a text-based PDF."
        )

    return text



api = FastAPI(title="CustomsX AI Tariff Service")

api.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class InvoiceRequest(BaseModel):
    invoice_text: str


@api.post("/classify")
def classify_endpoint(request: InvoiceRequest):
    if not request.invoice_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Invoice text cannot be empty"
        )

    try:
        ai_result = classify_invoice(request.invoice_text)
        print("AI RESULT:", ai_result)

        final_result = validate_tariff(ai_result)

        final_result["request_id"] = str(uuid.uuid4())
        final_result["jurisdiction"] = "DEMO"
        return final_result

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to process invoice at this time"
        )

@api.post("/classify-pdf")
async def classify_pdf_endpoint(
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file"
        )

    try:
        pdf_text = extract_pdf_text(file.file)

        ai_result = classify_invoice(pdf_text)
        print("AI RESULT:", ai_result)
        
        final_result = validate_tariff(ai_result)

        final_result["request_id"] = str(uuid.uuid4())
        final_result["jurisdiction"] = "DEMO"

        return final_result

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception as error:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Unable to process PDF invoice: {str(error)}"
        )

    finally:
        await file.close()


# Noir circuit lives in the repository's zk/ directory.
NOIR_PROJECT = Path(__file__).resolve().parent.parent / "zk"


class ProofRequest(BaseModel):
    item_cost: int = Field(gt=0)
    duty_rate_percent: int = Field(ge=0, le=100)
    declared_duty: int = Field(ge=0)


@api.post("/generate-proof")
def generate_proof(request: ProofRequest):
    project = NOIR_PROJECT

    if not (project / "Nargo.toml").exists():
        raise HTTPException(
            status_code=500,
            detail=(
                f"Noir project was not found. "
                f"Project path: {project}; "
                f"project exists: {project.exists()}; "
                f"Nargo.toml exists: {(project / 'Nargo.toml').exists()}"
            )
        )

    if request.item_cost <= 0:
        raise HTTPException(
            status_code=400,
            detail="Item cost must be greater than zero."
        )

    expected_duty = (
        request.item_cost * request.duty_rate_percent
    ) // 100

    if expected_duty != request.declared_duty:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Duty mismatch: expected {expected_duty}, "
                f"received {request.declared_duty}."
            )
        )

    prover_file = project / "Prover.toml"

    prover_file.write_text(
        f'item_cost = "{request.item_cost}"\n'
        f'duty_rate_percent = "{request.duty_rate_percent}"\n'
        f'declared_duty = "{request.declared_duty}"\n',
        encoding="utf-8"
    )

    try:
        subprocess.run(
            ["nargo", "execute", "customsx_zkp"],
            cwd=project,
            check=True,
            capture_output=True,
            text=True,
            timeout=120
        )

        witness = project / "target" / "customsx_zkp.gz"
        bytecode = project / "target" / "customsx_zkp.json"
        output_dir = project / "target" / "api_proof"
        output_dir.mkdir(parents=True, exist_ok=True)

        subprocess.run(
            [
                "bb", "prove",
                "-s", "ultra_honk",
                "-b", str(bytecode),
                "-w", str(witness),
                "-o", str(output_dir),
                "--oracle_hash", "keccak"
            ],
            cwd=project,
            check=True,
            capture_output=True,
            text=True,
            timeout=180
        )

        proof_path = output_dir / "proof"
        inputs_path = output_dir / "public_inputs"

        proof = "0x" + proof_path.read_bytes().hex()
        raw_inputs = inputs_path.read_bytes()

        if len(raw_inputs) != 64:
            raise RuntimeError(
                f"Expected 64 bytes of public inputs, got {len(raw_inputs)}"
            )

        public_inputs = [
            "0x" + raw_inputs[:32].hex(),
            "0x" + raw_inputs[32:].hex()
        ]

        return {
            "proof": proof,
            "publicInputs": public_inputs,
            "itemCost": request.item_cost,
            "dutyRatePercent": request.duty_rate_percent,
            "declaredDuty": request.declared_duty
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="Proof generation timed out."
        )

    except subprocess.CalledProcessError as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "Proof generation failed: "
                + (error.stderr or error.stdout or "Unknown error")
            )
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to generate proof: {error}"
        )


class RiskInvoiceRequest(BaseModel):
    invoice_id: str
    supplier: str
    product_description: str
    declared_hs_code: str
    quantity: int
    unit_price: float
    total: float
    currency: str = "USD"
    origin: str


@api.post("/analyze-invoice")
def analyze_invoice_endpoint(request: RiskInvoiceRequest):
    invoice = request.model_dump()

    try:
        defender_result = analyze_invoice_with_defender(invoice)
        risk_result = calculate_risk_score(invoice, defender_result)

        proof_result = process_zk_response(
            invoice,
            risk_result,
            risk_result["price_benchmark"],
            threshold=19,
        )

        return {
            "request_id": str(uuid.uuid4()),
            "invoice": invoice,
            "defender_analysis": defender_result,
            "risk_assessment": risk_result,
            "zk_proof": proof_result,
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Invoice analysis failed: {str(error)}",
        )


if __name__ == "__main__":

    try:
        cases_file = Path(__file__).parent / "adversarial_cases.json"

        with open(cases_file, "r", encoding="utf-8") as file:   
            data = json.load(file)

        for case in data["cases"]:

            invoice = case["invoice"]

            print("\n" + "=" * 50)
            print("ATTACK ID:", case["attack_id"])
            print("ATTACK TYPE:", case["attack_type"])
            print("PRODUCT:", invoice["product_description"])

            defender_result = analyze_invoice_with_defender(invoice)

            risk_result = calculate_risk_score(
                invoice,
                defender_result
            )

            print("\nDEFENDER RESULT:")
            print(json.dumps(defender_result, indent=4))

            print("\nFINAL RISK ASSESSMENT:")
            print(json.dumps(risk_result, indent=4))

    except Exception as error:
        print("Error:", error)
