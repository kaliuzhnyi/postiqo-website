/* Editable estimates for an ongoing vehicle listing rotation. */
(() => {
  "use strict";

  function estimateListingWork(values) {
    const { inventory, hourlyCost, postingMinutes, removalMinutes, sharingMinutes, rotationDays, accounts } = values;
    const dailyListings = inventory / rotationDays;
    const monthlyListings = dailyListings * 30;
    const minutesPerListing = postingMinutes + removalMinutes + sharingMinutes;
    const manualHours = monthlyListings * minutesPerListing / 60;
    const manualCost = manualHours * hourlyCost;
    const subscription = accounts * (accounts >= 5 ? 90 : 100);
    return {
      dailyListings,
      monthlyListings,
      minutesPerListing,
      manualHours,
      manualCost,
      subscription,
      netValue: manualCost - subscription
    };
  }

  // The same calculation is checked with Node's built-in test runner.
  if (typeof module !== "undefined" && module.exports) module.exports = { estimateListingWork };
  if (typeof document === "undefined") return;

  const form = document.getElementById("listing-calculator");
  if (!form) return;
  const results = document.getElementById("calculator-results");
  const error = document.getElementById("calculator-error");
  const number = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 });
  const money = value => `${value < 0 ? "-" : ""}C$${new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 }).format(Math.abs(value))}`;
  const fields = [...form.querySelectorAll("input[name]")];
  const write = (id, value) => { document.getElementById(id).textContent = value; };

  function update() {
    const valid = fields.every(field => field.value !== "" && field.validity.valid && Number.isFinite(field.valueAsNumber));
    fields.forEach(field => field.setAttribute("aria-invalid", String(field.value === "" || !field.validity.valid)));
    error.hidden = valid;
    results.hidden = !valid;
    if (!valid) return;

    const values = Object.fromEntries(fields.map(field => [field.name, field.valueAsNumber]));
    const estimate = estimateListingWork(values);
    write("calculator-hours", `${number.format(estimate.manualHours)} staff hours / month`);
    write("calculator-value", money(estimate.netValue));
    write("calculator-value-label", estimate.netValue >= 0 ? "Estimated savings / month" : "Monthly difference: subscription costs more");
    // A negative result must stay visible, rather than being turned into a savings claim.
    results.classList.toggle("calculator-negative", estimate.netValue < 0);
    write("calculator-manual", money(estimate.manualCost));
    write("calculator-subscription", money(estimate.subscription));
    write("calculator-plan", values.accounts === 1 ? "1 publishing account" : `${values.accounts} accounts at ${money(values.accounts >= 5 ? 90 : 100)} / month each`);
    write("calculator-routine", `${number.format(estimate.dailyListings)} posts + ${number.format(estimate.dailyListings)} removals per day${values.sharingMinutes > 0 ? ", with group sharing" : ""}.`);
    write("calculator-cycle", `Based on a ${number.format(values.rotationDays)}-day listing rotation.`);
    write("calculator-formula", `${number.format(values.inventory)} vehicles / ${number.format(values.rotationDays)} days x 30 days x (${number.format(values.postingMinutes)} + ${number.format(values.removalMinutes)} + ${number.format(values.sharingMinutes)} minutes) / 60 = ${number.format(estimate.manualHours)} manual hours per month.`);
  }

  let pendingUpdate;
  form.addEventListener("input", () => {
    clearTimeout(pendingUpdate);
    pendingUpdate = setTimeout(update, 180);
  });
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("reset", () => {
    clearTimeout(pendingUpdate);
    setTimeout(update, 0);
  });
  // Keep a readable worked example if JavaScript is unavailable.
  form.hidden = false;
  update();
})();
