package com.dealfilter.vitaminshoppe.domain

import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.StoreLocation

/** Builds the "review these deals" prompt people paste into ChatGPT, Claude, Gemini, etc. */
object AiPrompt {
    /** Keeps the prompt comfortably inside free-tier chat limits. */
    const val MAX_ITEMS = 35

    fun build(
        deals: List<DealItem>,
        totalMatching: Int,
        store: StoreLocation?,
        mode: FulfillmentMode
    ): String {
        val shown = deals.take(MAX_ITEMS)
        val where = when {
            mode == FulfillmentMode.PICKUP && store != null ->
                "for in-store pickup at The Vitamin Shoppe, ${store.name} (${store.fullAddress})"
            store != null -> "from The Vitamin Shoppe online (stock also checked at ${store.name})"
            else -> "from The Vitamin Shoppe online"
        }
        val scope = if (totalMatching > shown.size) {
            "These are the top ${shown.size} of $totalMatching deals matching my filters."
        } else {
            "These are all ${shown.size} deals matching my filters."
        }
        val cartNote = if (shown.any { it.hasCartOnlyPrice }) {
            "\nNote: prices marked \"≈ in cart\" are estimates — the site applies that clearance discount only at checkout.\n"
        } else ""
        val lines = shown.mapIndexed { i, d ->
            d.toPromptLines(i + 1, store?.name)
        }.joinToString("\n\n")

        return """
You are an expert clinical pharmacologist, biochemist, and evidence-based longevity physician.

I'm considering ${shown.size} clearance supplement deals $where. $scope
Critically evaluate them for scientific efficacy, bioavailability of the chemical form, formulation safety, and true value per effective dose.

### Evaluation criteria
1. **Evidence score (/10)** — quality of human clinical evidence for the main ingredient's intended use.
2. **Bioavailability & chemical form** — e.g. magnesium glycinate vs oxide, methylcobalamin vs cyanocobalamin, triglyceride vs ethyl-ester omega-3. Penalize poorly absorbed or irritating forms.
3. **Value per effective dose** — use the price, servings and cost per serving given; account for under-dosing.
4. **Verdict** — `BUY` (strong evidence, good form, great value), `CONSIDER` (useful for specific goals or acceptable if budget-limited), `PASS` (weak evidence, poor form, under-dosed, or proprietary blend).

### What I want back
1. A Markdown table: | # | Brand & product | Price (was, % off) | Key active & dose | Evidence /10 | Form rating | Verdict |
2. **Top 3 value picks** with the pharmacology behind each, why the discount matters, and a typical dosing protocol.
3. **Red flags** — items to skip despite the discount (fillers, under-dosing, poor forms, safety concerns).
If you don't know a product's exact dose, say so rather than guessing.
$cartNote
---

### Deals (${shown.size})

$lines
""".trimIndent()
    }
}
