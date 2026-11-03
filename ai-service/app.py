
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import uuid 

from pathlib import Path

from dotenv import load_dotenv
from groq import Groq
import subprocess
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException

from pypdf import PdfReader
from fastapi import UploadFile, File


load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

if not api_key:
    raise ValueError("GROQ_API_KEY is missing from the .env file")

client = Groq(api_key=api_key)

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


class ProofRequest(BaseModel):
    item_cost: int = Field(gt=0)
    duty_rate_percent: int = Field(ge=0, le=100)
    declared_duty: int = Field(ge=0)
api = FastAPI(title="CustomsX AI Tariff Service")
api.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to process PDF invoice"
        )

    finally:
        await file.close()

# Noir circuit lives in the repository's zk/ directory.
NOIR_PROJECT = Path(__file__).resolve().parent.parent / "zk"


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
if __name__ == "__main__":
    invoice = """
    Product: Lithium-ion Battery Pack 10kWh
    Quantity: 1
    Value: $5000
    """

    try:
        ai_result = classify_invoice(invoice)
        final_result = validate_tariff(ai_result)

        print(json.dumps(final_result, indent=4))

    except Exception as error:
        print("Error:", error)
