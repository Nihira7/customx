// CustomsX: prove that a declared customs duty is correct
// without revealing the private factory cost.
//
//   expected_duty = (item_cost * duty_rate_percent) / 100
//
// item_cost         : PRIVATE (factory cost in USD)
// duty_rate_percent : PUBLIC  (e.g. 5 means 5%)
// declared_duty     : PUBLIC  (duty amount declared on the customs form)

fn main(item_cost: u64, duty_rate_percent: pub u64, declared_duty: pub u64) {
    // A duty rate above 100% is not valid
    assert(duty_rate_percent <= 100);

    // Integer division on u64 (the multiplication is overflow-checked in-circuit)
    let expected_duty: u64 = (item_cost * duty_rate_percent) / 100;

    // Core constraint: the declared duty must equal the computed duty
    assert(expected_duty == declared_duty);
}

#[test]
fn test_valid_duty() {
    // 5000 * 5 / 100 = 250
    main(5000, 5, 250);
}

#[test(should_fail)]
fn test_invalid_duty() {
    // 5000 * 5 / 100 = 250, but 100 is declared, so the circuit must reject it
    main(5000, 5, 100);
}