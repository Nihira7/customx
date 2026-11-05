fn main(
    declared_unit_price: u64,
    declared_quantity: u64,
    declared_total: u64,
    price_reference_min: pub u64,
    price_reference_max: pub u64,
    max_allowed_risk_score: pub u64,
    calculated_risk_score: u64,
) {
    assert(price_reference_min <= price_reference_max);
    assert(declared_quantity > 0);

    // Unit price must be within the reference range.
    assert(declared_unit_price >= price_reference_min);
    assert(declared_unit_price <= price_reference_max);

    // Invoice arithmetic must be correct.
    let calculated_total = declared_unit_price * declared_quantity;
    assert(calculated_total == declared_total);

    // Only low-risk invoices qualify for approval.
    assert(calculated_risk_score <= max_allowed_risk_score);
}

#[test]
fn test_valid_approval() {
    main(1000, 2, 2000, 700, 1300, 19, 10);
}

#[test(should_fail)]
fn test_price_below_reference() {
    main(699, 2, 1398, 700, 1300, 19, 10);
}

#[test(should_fail)]
fn test_price_above_reference() {
    main(1301, 2, 2602, 700, 1300, 19, 10);
}

#[test(should_fail)]
fn test_arithmetic_mismatch() {
    main(1000, 2, 1900, 700, 1300, 19, 10);
}

#[test(should_fail)]
fn test_risk_too_high() {
    main(1000, 2, 2000, 700, 1300, 19, 20);
}

#[test(should_fail)]
fn test_zero_quantity() {
    main(1000, 0, 0, 700, 1300, 19, 10);
}
