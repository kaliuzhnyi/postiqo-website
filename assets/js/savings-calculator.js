/* Example labour costs, not a promise of sales or cash savings. */
(() => {
  "use strict";

  function estimateListingWork(values) {
    const { activeListings, newListings, postingMinutes, refreshes, refreshMinutes, hourlyCost, reviewHours, accounts } = values;
    const manualHours = (newListings * postingMinutes + activeListings * refreshes * refreshMinutes) / 60;
    const subscription = accounts * (accounts >= 5 ? 90 : 100);
    const hoursBack = manualHours - reviewHours;
    return {
      manualHours,
      subscription,
      hoursBack,
      manualCost: manualHours * hourlyCost,
      assistedCost: subscription + reviewHours * hourlyCost,
      netValue: hoursBack * hourlyCost - subscription,
      breakEvenHours: hourlyCost > 0 ? subscription / hourlyCost + reviewHours : null
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
    write("calculator-hours", `${number.format(estimate.hoursBack)} hours`);
    write("calculator-value", money(estimate.netValue));
    write("calculator-value-label", estimate.netValue >= 0 ? "Labour value after subscription / month" : "Negative labour value at these inputs / month");
    // A negative result must stay visible, rather than being turned into a savings claim.
    results.classList.toggle("calculator-negative", estimate.netValue < 0);
    write("calculator-manual", `${number.format(estimate.manualHours)} hours / ${money(estimate.manualCost)}`);
    write("calculator-assisted", `${number.format(values.reviewHours)} review hours + ${money(estimate.subscription)} plan / ${money(estimate.assistedCost)}`);
    write("calculator-plan", `${values.accounts >= 5 ? "Multi-Account" : "Standard"} plan: ${values.accounts} ${values.accounts === 1 ? "account" : "accounts"} at ${money(values.accounts >= 5 ? 90 : 100)} per account / month.`);
    write("calculator-break-even", estimate.breakEvenHours === null
      ? "Enter an hourly cost above zero to calculate the break-even point."
      : `Break-even: replace ${number.format(estimate.breakEvenHours)} hours of manual listing work per month, including your ${number.format(values.reviewHours)} review hours.`);
    write("calculator-formula", `(${number.format(values.newListings)} new listings x ${number.format(values.postingMinutes)} minutes + ${number.format(values.activeListings)} active listings x ${number.format(values.refreshes)} refreshes x ${number.format(values.refreshMinutes)} minutes) / 60 = ${number.format(estimate.manualHours)} manual hours per month.`);
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
